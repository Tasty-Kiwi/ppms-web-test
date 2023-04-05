//@ts-ignore
import { LuaFactory } from "wasmoon";
import * as Comlink from "comlink";

import MyWorker from "./worker?worker";

export interface Mesh {
  vertexes: Array<Array<number>>;
  segments: Array<Array<number>>;
  colors: Array<number>;
}

const decompressMeshes = `
  function ()
    return function (meshlist)
      for meshindex, mesh in ipairs(meshlist) do
        for k, v in pairs(mesh) do
          if type(v)=="number" then
            mesh[k] = meshlist[v][k]
          end
        end
      end
      for meshindex, mesh in ipairs(meshlist) do
        if mesh.colors~=nil then
          local colors = mesh.colors
          mesh.colors = {}
          for color, group in pairs(colors) do
            for groupitemindex, groupitem in ipairs(group) do
              if type(groupitem)=="table" then
                for i = groupitem[1], groupitem[2] do
                  mesh.colors[i+1] = color
                end
              elseif type(groupitem)=="number" then
                mesh.colors[groupitem+1] = color
              end
            end
          end
        end
      end
      return meshlist
    end
  end`;

const decompressColors = `
  function ()
    return function (meshlist)
      for meshindex, mesh in ipairs(meshlist) do
        if mesh.colors~=nil then
          local colors = mesh.colors
          mesh.colors = {}
          for color, group in pairs(colors) do
            for groupitemindex, groupitem in ipairs(group) do
              if type(groupitem)=="table" then
                for i = groupitem[1], groupitem[2] do
                  mesh.colors[i+1] = color
                end
              elseif type(groupitem)=="number" then
                mesh.colors[groupitem+1] = color
              end
            end
          end
        end
      end
      return meshlist
    end
  end`;

export async function parseMesh(luaStr: string, meshId: number): Promise<Mesh> {
  const factory = new LuaFactory();

  const lua = await factory.createEngine();

  try {
    // disable potentially dangerous or not supported by PPL libraries from loading (and remove require to replace with js alternative)
    await lua.doString(
      "os = nil io = nil debug = nil crypto = nil coroutine = nil utf8 = nil"
    );

    // Preload built-in helpers
    await lua.doString(
      `package.preload['/ppms/decompress_meshes.lua'] = ${decompressMeshes}`
    );
    await lua.doString(
      `package.preload['/ppms/decompress_colors.lua'] = ${decompressColors}`
    );

    await lua.doString(luaStr);
    const meshes: Mesh = lua.global.get("meshes");
    //@ts-ignore
    return meshes[meshId];
  } finally {
    // Close the lua environment, so it can be freed
    lua.global.close();
  }
}

const workerInstance = new MyWorker();

export const workerParseMesh =
  Comlink.wrap<typeof import("./worker")>(workerInstance).workerParseMesh;
