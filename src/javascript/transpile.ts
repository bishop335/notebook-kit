import type {Cell} from "../lib/notebook.js";
import {rewriteFileExpressions} from "./files.js";
import {hasImportDeclaration, rewriteImportDeclarations, rewriteImportExpressions} from "./imports.js";
import {transpileObservable} from "./observable.js";
import {parseJavaScript} from "./parse.js";
import {Sourcemap} from "./sourcemap.js";
import {transpileTemplate} from "./template.js";

export type TranspiledJavaScript = {
  /** the source code of a JavaScript function defining the primary variable */
  body: string;
  /** any unbound references in body; corresponds to the body arguments, in order */
  inputs?: string[];
  /** if present, the body returns an object of named outputs; alternative to output */
  outputs?: string[];
  /** if present, the body returns a single named output; alternative to outputs */
  output?: string;
  /** whether to implicitly display the body value (e.g., an expression) */
  autodisplay?: boolean;
  /** whether to implicitly derive a view; for ojs compatibility; requires viewof output */
  autoview?: boolean;
  /** whether to implicitly derive a mutable; for ojs compatibility; requires mutable output */
  automutable?: boolean;
};

export type TranspileOptions = {
  /** If true, resolve local imports paths relative to document.baseURI. */
  resolveLocalImports?: boolean;
  /** If true, resolve file using import.meta.url (so Vite treats it as an asset). */
  resolveFiles?: boolean;
};

export function transpile(
  input: string,
  mode: Cell["mode"],
  options?: TranspileOptions
): TranspiledJavaScript {
  return mode === "ojs"
    ? transpileObservable(input, options) // TODO ojs+md etc.
    : transpileJavaScript(transpileMode(input, mode), options);
}

function transpileMode(input: string, mode: Exclude<Cell["mode"], "ojs">): string {
  if (mode === "js") return input;
  const tag = mode === "tex" ? "tex.block" : mode === "sql" ? "__sql(db, Inputs.table)" : mode; // for now
  const raw = mode === "html" || mode === "tex" || mode === "dot";
  return transpileTemplate(input, tag, raw);
}

export function transpileJavaScript(
  input: string,
  options?: TranspileOptions
): TranspiledJavaScript {
  const cell = parseJavaScript(input);
  let async = cell.async;
  const inputs = Array.from(new Set(cell.references.map((r) => r.name)));
  if (hasImportDeclaration(cell.body)) async = true;
  const outputs = Array.from(new Set(cell.declarations?.map((r) => r.name)));
  const output = new Sourcemap(input).trim();
  rewriteImportDeclarations(output, cell.body, inputs, options);
  rewriteImportExpressions(output, cell.body, options);
  if (options?.resolveFiles) rewriteFileExpressions(output, cell.body);
  if (cell.expression) output.insertLeft(0, `return (\n`);
  output.insertLeft(0, `${async ? "async " : ""}(${inputs}) => {\n`);
  if (outputs.length > 0) output.insertRight(input.length, `\nreturn {${outputs}};`);
  if (cell.expression) output.insertRight(input.length, `\n)`);
  output.insertRight(input.length, "\n}");
  const body = String(output);
  const autodisplay = cell.expression && !(inputs.includes("display") || inputs.includes("view"));
  return {body, inputs, outputs, autodisplay};
}
