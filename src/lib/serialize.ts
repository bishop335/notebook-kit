import type {CellSpec, Cell, Notebook, NotebookTheme} from "./notebook.js";
import {toNotebook} from "./notebook.js";
import {isEmpty} from "./text.js";

export function serialize(notebook: Notebook, {document = window.document} = {}): string {
  const _notebook = document.createElement("notebook");
  _notebook.setAttribute("theme", notebook.theme);
  if (notebook.readOnly) _notebook.setAttribute("readonly", "");
  _notebook.appendChild(document.createTextNode("\n  "));
  const _title = document.createElement("title");
  _title.textContent = notebook.title;
  _notebook.appendChild(_title);
  for (const cell of notebook.cells) {
    _notebook.appendChild(document.createTextNode("\n  "));
    const _cell = document.createElement("script");
    _cell.id = String(cell.id);
    _cell.type = serializeMode(cell.mode);
    _cell.textContent = indent(cell.value.replace(/<(?=\\*\/script(\s|>))/gi, "<\\"));
    if (cell.pinned) _cell.setAttribute("pinned", "");
    _notebook.appendChild(_cell);
  }
  _notebook.appendChild(document.createTextNode("\n"));
  return `<!doctype html>\n${_notebook.outerHTML}\n`;
}

export function deserialize(data: string, {parser = new DOMParser()} = {}): Notebook {
  const document = parser.parseFromString(data, "text/html");
  const _notebook = document.querySelector("notebook");
  const theme = deserializeTheme(_notebook?.getAttribute("theme"));
  const readOnly = _notebook?.hasAttribute("readonly");
  const title = document.querySelector("title")?.textContent ?? undefined;
  let maxCellId = 0;
  const cellIds = new Set<number>();
  const cells = Array.from<HTMLScriptElement, CellSpec>(
    document.querySelectorAll("notebook script"),
    (cell) => {
      let id = Math.floor(Number(cell.id));
      if (!isFinite(id) || !(id > 0) || cellIds.has(id)) id = ++maxCellId;
      else if (id > maxCellId) maxCellId = id;
      cellIds.add(id);
      const pinned = cell.hasAttribute("pinned");
      const value = dedent(cell.textContent?.replace(/<\\(?=\\*\/script(\s|>))/gi, "<") ?? "");
      const mode = deserializeMode(cell.getAttribute("type"));
      return {id, pinned, mode, value};
    }
  );
  return toNotebook({title, theme, readOnly, cells});
}

function serializeMode(mode: Cell["mode"]): string {
  switch (mode) {
    case "md":
      return "text/markdown";
    case "html":
      return "text/html";
    case "tex":
      return "application/x-tex";
    case "sql":
      return "application/sql";
    case "dot":
      return "text/vnd.graphviz";
    case "ojs":
      return "application/vnd.observable.javascript";
    default:
      return "module";
  }
}

function deserializeMode(mode: string | null): Cell["mode"] {
  switch (mode) {
    case "text/markdown":
      return "md";
    case "text/html":
      return "html";
    case "application/x-tex":
      return "tex";
    case "application/sql":
      return "sql";
    case "text/vnd.graphviz":
      return "dot";
    case "application/vnd.observable.javascript":
      return "ojs";
    default:
      return "js";
  }
}

function deserializeTheme(theme: string | null | undefined): Notebook["theme"] {
  return (theme as NotebookTheme) ?? "air";
}

function dedent(text: string): string {
  const lines = text.split(/\r\n?|\n/);
  if (isEmpty(lines[lines.length - 1])) lines.pop();
  if (isEmpty(lines[0])) lines.shift();
  return lines.map((l) => l.replace(/^ {4}/, "")).join("\n");
}

function indent(text: string): string {
  const lines = text.split(/\r\n?|\n/);
  return `\n${lines.map((l) => (l.trim() ? `    ${l}` : "")).join("\n")}\n  `;
}
