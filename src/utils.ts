import * as Comlink from "comlink";

import MyWorker from "./worker?worker";

export interface Mesh {
  vertexes: Array<Array<number>>;
  segments: Array<Array<number>>;
  colors: Array<number>;
}

const workerInstance = new MyWorker();

export const workerParseMesh =
  Comlink.wrap<typeof import("./worker")>(workerInstance).workerParseMesh;
