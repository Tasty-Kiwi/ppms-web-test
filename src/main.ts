import "./style.css"

import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import Stats from "three/examples/jsm/libs/stats.module"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass"
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js"

import { workerParseMesh, Mesh } from "./utils"
let scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  controls: OrbitControls,
  raycaster: THREE.Raycaster,
  sphereInter: THREE.Mesh,
  composer: EffectComposer,
  transformControl: TransformControls
const pointer = new THREE.Vector2()

function convertToFloatColors(color: number): Array<number> {
  return [
    ((color >> 24) & 255) / 255,
    ((color >> 16) & 255) / 255,
    ((color >> 8) & 255) / 255,
    (color & 255) / 255,
  ]
}

const material = new THREE.LineBasicMaterial({
  linejoin: "miter",
  // color: 0xffffff
  transparent: true,
  vertexColors: true,
})

async function createRenderable(meshData: Mesh): Promise<THREE.LineSegments> {
  const points: Array<number> = []
  const colors: Array<number> = []

  if (!meshData.colors) console.warn("No colors detected in the mesh. Falling back to white...")
  if (meshData.colors && meshData.vertexes.length !== meshData.colors.length)
    throw "Invalid color table length"
  meshData.segments.forEach((segment) => {
    if (segment.length < 2) throw `Invalid segment detected: ${JSON.stringify(segment)}`
    for (let i = 1; i < segment.length; i++) {
      if (meshData.vertexes[segment[i - 1]].length === 3)
        points.push(...meshData.vertexes[segment[i - 1]])
      else if (meshData.vertexes[segment[i - 1]].length === 2)
        points.push(...meshData.vertexes[segment[i - 1]], 0)
      else throw `Invalid vertex detected: ${JSON.stringify(meshData.vertexes[segment[i - 1]])}`
      if (meshData.vertexes[segment[i]].length === 3) points.push(...meshData.vertexes[segment[i]])
      else if (meshData.vertexes[segment[i]].length === 2)
        points.push(...meshData.vertexes[segment[i]], 0)
      else throw `Invalid vertex detected: ${JSON.stringify(meshData.vertexes[segment[i]])}`
    }

    if (meshData.colors) {
      for (let i = 1; i < segment.length; i++) {
        colors.push(...convertToFloatColors(meshData.colors[segment[i - 1]]))
        colors.push(...convertToFloatColors(meshData.colors[segment[i]]))
      }
    } else {
      for (let i = 1; i < segment.length; i++) {
        colors.push(1, 1, 1, 1)
        colors.push(1, 1, 1, 1)
      }
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4))

  return new THREE.LineSegments(geometry, material)
}
const meshLua = `
meshes = {
  {
    vertexes = {{0, 0, 0}, {100, 100, 100}},
    segments = {{0,1}},
    colors = {0xffffffff, 0xffffffff}
  }
}`
const meshLua2 = `
local function make_color(r, g, b, a)
  local color = r * 256 + g
  color = color * 256 + b
  color = color * 256 + a
  return color
end

local pi = math.pi * 2
local tau = pi

local mesh_vertexes = {}
local mesh_segments = {}
local mesh_colors = {}

local function add_dot(x, y, z, color)
  local segment_collection = {}
  
  local detail = 3
  
  for i = 1, detail do
    table.insert(mesh_vertexes, {x + math.cos(tau / detail * i) * 3, y + math.sin(tau / detail * i) * 3, z})
    table.insert(segment_collection, #mesh_vertexes - 1)
    table.insert(mesh_colors, color)
  end
  
  table.insert(segment_collection, #mesh_vertexes - detail)
  
  table.insert(mesh_segments, segment_collection)
end

local initial_radius = 250
local points = 120

for i = 0, pi, pi / points do
  for j = 0, pi, pi / points do
    local bump = (math.sin(i*10) * math.cos(j*5)) * 25
    local radius = initial_radius + bump
    add_dot(math.sin(i) * math.cos(j) * radius, math.cos(i) * radius, math.sin(i) * math.sin(j) * radius, make_color(0, (radius / 275) * 255, 0, 255))
    --add_dot(math.sin(i) * math.cos(j) * radius, math.cos(i) * radius, math.sin(i) * math.sin(j) * radius, 0xffffffff)
  end
end

meshes = {
  {
    vertexes = mesh_vertexes, 
    segments = mesh_segments,
    colors = mesh_colors
  }
}`

init()
async function init() {
  //@ts-ignore
  const stats: Stats = new Stats()
  document.body.appendChild(stats.dom)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 6000)
  scene = new THREE.Scene()

  camera.position.set(0, 0, 1000)
  camera.lookAt(0, 0, 0)

  const renderScene = new RenderPass(scene, camera)

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
  )
  bloomPass.threshold = 0
  bloomPass.strength = 1
  bloomPass.radius = 1

  composer = new EffectComposer(renderer)
  composer.addPass(renderScene)
  composer.addPass(bloomPass)
  bloomPass.renderToScreen = true

  document.body.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  // scene.background = new THREE.Color(0x040e13)

  scene.background = new THREE.Color(0x000000)

  const geometry = new THREE.SphereGeometry(10)
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff })

  sphereInter = new THREE.Mesh(geometry, material)
  sphereInter.visible = false
  scene.add(sphereInter)

  console.time("parseMesh")
  const meshObj: Mesh = await workerParseMesh(meshLua2, 0)
  console.timeEnd("parseMesh")

  console.time("createRenderable")
  const renderedMesh = await createRenderable(meshObj)
  scene.add(renderedMesh)
  console.timeEnd("createRenderable")

  // const size = 3000;
  // const divisions = 45;

  // scene.add( new THREE.GridHelper(size, divisions) );

  const dirX = new THREE.Vector3(1, 0, 0)
  dirX.normalize()

  const dirY = new THREE.Vector3(0, 1, 0)
  dirY.normalize()

  const dirZ = new THREE.Vector3(0, 0, 1)
  dirZ.normalize()

  const hexX = 0xff0000
  const hexY = 0x00ff00
  const hexZ = 0x0000ff

  const origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  const length = 1500

  // scene.add( new THREE.ArrowHelper( dirX, origin, length, hexX ) );
  // scene.add( new THREE.ArrowHelper( dirY, origin, length, hexY ) );
  // scene.add( new THREE.ArrowHelper( dirZ, origin, length, hexZ ) );

  renderer.render(scene, camera)
  window.addEventListener("resize", onWindowResize)

  async function render() {
    // required if controls.enableDamping or controls.autoRotate are set to true
    controls.update()

    /*raycaster.setFromCamera(pointer, camera)

    const intersects = raycaster.intersectObject(renderedMesh, true)
    if (intersects.length > 0) {
      sphereInter.visible = true
      sphereInter.position.copy(intersects[0].point)
      console.log(intersects[0].index, intersects[0].point)
    } else {
      sphereInter.visible = false
    }*/
    composer.render()
    stats.update()
  }
  function animate() {
    requestAnimationFrame(animate)
    render()
  }
  animate()
}
function onWindowResize() {
  const width = window.innerWidth
  const height = window.innerHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()

  renderer.setSize(width, height)
  composer.setSize(width, height)
  renderer.render(scene, camera)
}
