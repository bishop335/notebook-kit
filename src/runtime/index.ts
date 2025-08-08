import type {Module} from "@observablehq/runtime";
import {Runtime} from "@observablehq/runtime";
import {fileAttachments} from "./stdlib/fileAttachment.js";
import {library} from "./stdlib/index.js";

export * from "./define.js";
export * from "./display.js";
export * from "./inspect.js";
export * from "./stdlib/index.js";

export type * from "./stdlib/databaseClient.js";
export type * from "./stdlib/fileAttachment.js";
export {DatabaseClient} from "./stdlib/databaseClient.js";
export {FileAttachment} from "./stdlib/fileAttachment.js";

export const runtime = Object.assign(new Runtime({...library, __ojs_runtime: () => runtime}), {fileAttachments});
export const main = (runtime as typeof runtime & {main: Module}).main = runtime.module();

main.constructor.prototype.defines = function (this: Module, name: string): boolean {
  return (
    this._scope.has(name) ||
    this._builtins.has(name) ||
    this._runtime._builtin._scope.has(name)
  );
};
