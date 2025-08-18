import {createReadStream, existsSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {json} from "node:stream/consumers";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import type {TemplateLiteral} from "acorn";
import {JSDOM} from "jsdom";
import type {PluginOption, IndexHtmlTransformContext} from "vite";
import type {DatabaseConfig} from "../databases/index.js";
import {getDatabase, isDefaultDatabase} from "../databases/index.js";
import {isEnoent} from "../lib/error.js";
import type {Cell, Notebook} from "../lib/notebook.js";
import {deserialize} from "../lib/serialize.js";
import {Sourcemap} from "../javascript/sourcemap.js";
import {transpile} from "../javascript/transpile.js";
import {parseTemplate} from "../javascript/template.js";
import {collectAssets} from "../runtime/stdlib/assets.js";
import {DatabaseClient} from "../runtime/stdlib/databaseClient.js";
import {highlight} from "../runtime/stdlib/highlight.js";
import {MarkdownRenderer} from "../runtime/stdlib/md.js";

/**
 * A function which performs a per-page transformation of the template HTML.
 *
 * @param source The source of the template (typically HTML).
 * @param context The Vite plugin context.
 * @returns The transformed template source HTML.
 */
export type TemplateTransform = (
  source: string,
  context: IndexHtmlTransformContext
) => string | Promise<string>;

/**
 * A function which transforms the parsed notebook.
 *
 * @param notebook The current (parsed) notebook.
 * @param context The Vite plugin context.
 * @returns The transformed notebook.
 */
export type NotebookTransform = (
  notebook: Notebook,
  context: IndexHtmlTransformContext
) => Notebook | Promise<Notebook>;

export interface ObservableOptions {
  /** The global window, for the default parser implementations. */
  window?: Pick<typeof globalThis, "DOMParser">;
  /** The parser implementation; defaults to `new window.DOMParser()`. */
  parser?: DOMParser;
  /** The path to the page template; defaults to the default template. */
  template?: string;
  /** An optional function which transforms the template HTML for the current page. */
  transformTemplate?: TemplateTransform;
  /** An optional function which transforms the notebook for the current page. */
  transformNotebook?: NotebookTransform;
}

export function observable({
  window = new JSDOM().window,
  parser = new window.DOMParser(),
  template = fileURLToPath(import.meta.resolve("../templates/default.html")),
  transformTemplate = (template) => template,
  transformNotebook = (notebook) => notebook
}: ObservableOptions = {}): PluginOption {
  return {
    name: "observable",
    buildStart() {
      this.addWatchFile(template);
    },
    handleHotUpdate(context) {
      if (context.file === resolve(template)) {
        context.server.hot.send({type: "full-reload"});
      }
    },
    transformIndexHtml: {
      order: "pre",
      async handler(input, context) {
        const notebook = await transformNotebook(deserialize(input, {parser}), context);
        const templateHtml = await transformTemplate(await readFile(template, "utf-8"), context);
        const document = parser.parseFromString(templateHtml, "text/html");
        const statics = new Set<Cell>();
        const assets = new Set<string>();
        const md = MarkdownRenderer({document});

        const {version} = (await import("../../package.json", {with: {type: "json"}})).default;
        let generator = document.querySelector("meta[name=generator]");
        generator ??= document.head.appendChild(document.createElement("meta"));
        generator.setAttribute("name", "generator");
        generator.setAttribute("content", `Observable Notebook Kit v${version}`);

        let title = document.querySelector("title");
        title ??= document.head.appendChild(document.createElement("title"));
        title.insertBefore(document.createTextNode(notebook.title), title.firstChild);

        let cells = document.querySelector("main");
        cells ??= document.body.appendChild(document.createElement("main"));
        for (const cell of notebook.cells) {
          const {id, mode, pinned, hidden, value} = cell;
          const contents = document.createDocumentFragment();
          const div = contents.appendChild(document.createElement("div"));
          div.id = `cell-${id}`;
          div.className = "observablehq observablehq--cell";
          if (mode === "md" && !hidden) {
            const template = parseTemplate(value);
            if (!template.expressions.length && !cell.output) statics.add(cell);
            const content = md([stripExpressions(template, value)]);
            const codes = content.querySelectorAll<HTMLElement>("code[class^=language-]");
            await Promise.all(Array.from(codes, highlight));
            div.appendChild(content);
          } else if (mode === "html" && !hidden) {
            const template = parseTemplate(value);
            if (!template.expressions.length && !cell.output) statics.add(cell);
            div.innerHTML = stripExpressions(template, value);
          } else if (mode === "sql" && cell.database && !cell.database.startsWith("var:")) {
            const template = parseTemplate(value);
            if (!template.expressions.length) {
              const dir = dirname(context.filename);
              const cacheDir = join(dir, ".observable", "cache");
              const hash = await DatabaseClient.hash.call(null, [value]);
              const cacheName = `${cell.database}-${hash}.json`;
              const cachePath = join(cacheDir, cacheName);
              if (!existsSync(cachePath)) {
                let config: DatabaseConfig | undefined;
                try {
                  const configPath = join(dir, ".observable", "databases.json");
                  const configStream = createReadStream(configPath, "utf-8");
                  const configs = (await json(configStream)) as Record<string, DatabaseConfig>;
                  config = configs[cell.database];
                } catch (error) {
                  if (!isEnoent(error)) throw error;
                }
                if (isDefaultDatabase(cell.database)) config ??= {type: cell.database};
                if (!config) throw new Error(`database not found: ${cell.database}`);
                try {
                  const database = await getDatabase(config, {cwd: dir});
                  const results = await database.call(null, [value]);
                  await mkdir(cacheDir, {recursive: true});
                  await writeFile(cachePath, JSON.stringify(results));
                } catch (error) {
                  console.error(error);
                }
              }
              cell.mode = "js";
              cell.value = `FileAttachment(${JSON.stringify(`.observable/cache/${cacheName}`)}).json().then(DatabaseClient.revive)${hidden ? "" : `.then(Inputs.table)${cell.output ? ".then(view)" : ""}`}`;
            }
          }
          collectAssets(assets, div);
          if (pinned) {
            const pre = contents.appendChild(document.createElement("pre"));
            const code = pre.appendChild(document.createElement("code"));
            code.className = `language-${mode}`;
            code.textContent = value;
            await highlight(code);
          }
          cells.appendChild(contents);
        }

        // Don’t error if assets are missing (matching Vite’s behavior).
        filterMissingAssets(assets, dirname(context.filename));

        const output = document.documentElement.outerHTML;
        const i = output.indexOf("</body>");
        if (!(i >= 0)) throw new Error("body not found");
        return (
          `<!doctype html>` +
          output.slice(0, i) +
          `<style type="text/css">
@import url("observable:styles/theme-${notebook.theme}.css");
</style><script type="module">
import {define} from "observable:runtime";${Array.from(assets)
            .map(
              (asset, i) => `
import asset${i + 1} from ${JSON.stringify(`${asset}?url`)};`
            )
            .join("")}${
            assets.size > 0
              ? `

const assets = new Map([
${Array.from(assets)
  .map((asset, i) => `  [${JSON.stringify(asset)}, asset${i + 1}]`)
  .join(",\n")}
]);`
              : ""
          }
${notebook.cells
  .filter((cell) => !statics.has(cell))
  .map((cell) => {
    const transpiled = transpile(cell, {resolveFiles: true});
    return `
define(
  {
    root: document.getElementById(\`cell-${cell.id}\`),
    expanded: [],
    variables: []
  },
  {
    id: ${cell.id},
    body: ${escapeScript(transpiled.body)},
    inputs: ${JSON.stringify(transpiled.inputs)},
    outputs: ${JSON.stringify(transpiled.outputs)},
    output: ${JSON.stringify(transpiled.output)},
    assets: ${assets.size > 0 ? "assets" : "undefined"},
    autodisplay: ${transpiled.autodisplay},
    autoview: ${transpiled.autoview},
    automutable: ${transpiled.automutable}
  }
);`;
  })
  .join("")}
</script>` +
          output.slice(i)
        );
      }
    }
  };
}

function filterMissingAssets(assets: Set<string>, dir: string): void {
  for (const asset of assets) {
    if (!existsSync(join(dir, asset))) {
      console.warn(`warning: asset not found: ${asset}`);
      assets.delete(asset);
    }
  }
}

function stripExpressions(template: TemplateLiteral, input: string): string {
  const source = new Sourcemap(input);
  let index = template.start;
  for (const q of template.quasis) {
    if (q.start > index) {
      // In a case such as <img src=${…} style=…>, we must replace the
      // placeholder with a non-empty value or it will change the interpre-
      // tation of the subsequent attribute to be part of the src attribute!
      // But we also don’t want to use a non-empty src attribute because that
      // would cause the browser to load an asset that does not exist (before
      // it is replaced by the client-generated content).
      if (hasPrecedingEquals(input, index)) {
        source.replaceLeft(index, q.start, '""');
      } else {
        source.delete(index, q.start);
      }
    }
    index = q.end;
  }
  return String(source);
}

/** Returns true if the specified character is preceded by an equals sign, ignoring whitespace. */
function hasPrecedingEquals(input: string, index: number): boolean {
  let i = index - 1;
  while (isSpaceCode(input.charCodeAt(i))) --i;
  return input.charCodeAt(i) === CODE_EQ;
}

const CODE_TAB = 9,
  CODE_LF = 10,
  CODE_FF = 12,
  CODE_CR = 13,
  CODE_SPACE = 32,
  CODE_EQ = 61;

/** Returns true if the specified character code is considered whitespace by HTML. */
function isSpaceCode(code: number): boolean {
  return (
    code === CODE_TAB ||
    code === CODE_LF ||
    code === CODE_FF ||
    code === CODE_SPACE ||
    code === CODE_CR
  );
}

/** Note: only suitable for use in a script element. */
function escapeScript(script: string): string {
  return script.replace(/<\/script>/g, "<\\/script>"); // TODO handle other contexts
}
