export type NotebookTheme =
  | "air"
  | "coffee"
  | "cotton"
  | "deep-space"
  | "glacier"
  | "ink"
  | "midnight"
  | "near-midnight"
  | "ocean-floor"
  | "parchment"
  | "slate"
  | "stark"
  | "sun-faded";

export interface NotebookSpec {
  /** the notebook’s cells, in top-to-bottom document order */
  cells?: CellSpec[];
  /** the notebook title, if any; extracted from the first h1 */
  title?: string;
  /** the notebook theme; defaults to "air" */
  theme?: NotebookTheme;
  /** if true, don’t allow editing */
  readOnly?: boolean;
}

export interface Notebook extends NotebookSpec {
  cells: Cell[];
  title: NonNullable<NotebookSpec["title"]>;
  theme: NonNullable<NotebookSpec["theme"]>;
  readOnly: NonNullable<NotebookSpec["readOnly"]>;
}

export interface CellSpec {
  /** the unique identifier for this cell */
  id: number;
  /** the committed cell value; defaults to empty */
  value?: string;
  /** the mode; affects how the value is evaluated; defaults to js */
  mode?: "js" | "ojs" | "md" | "html" | "tex" | "dot" | "sql";
  /** if true, the editor will stay open when not focused; defaults to false */
  pinned?: boolean;
  /** if true, implicit display will be suppressed; defaults to false */
  hidden?: boolean;
  /** if present, exposes the cell’s value to the rest of the notebook */
  output?: string;
  /** for SQL cells, the database to query; use var:<name> to refer to a variable */
  database?: string;
  /** for SQL cells, the oldest allowable age of the cached query result */
  since?: Date | string | number;
}

export interface Cell extends CellSpec {
  value: NonNullable<CellSpec["value"]>;
  mode: NonNullable<CellSpec["mode"]>;
  pinned: NonNullable<CellSpec["pinned"]>;
  hidden: NonNullable<CellSpec["hidden"]>;
  since?: Date;
}

export function toNotebook({
  cells = [],
  title = "Untitled",
  theme = "air",
  readOnly = false
}: NotebookSpec): Notebook {
  return {
    cells: cells.map(toCell),
    title,
    theme,
    readOnly
  };
}

export function toCell({
  id,
  value = "",
  mode = "js",
  pinned = defaultPinned(mode),
  hidden = false,
  output,
  database = mode === "sql" ? "var:db" : undefined,
  since
}: CellSpec): Cell {
  return {
    id,
    value,
    mode,
    pinned,
    hidden,
    output,
    database: mode === "sql" ? database : undefined,
    since: since !== undefined ? asDate(since) : undefined
  };
}

function asDate(date: Date | string | number): Date {
  return date instanceof Date ? date : new Date(date);
}

export function defaultPinned(mode: Cell["mode"]): boolean {
  return mode === "js" || mode === "sql" || mode === "ojs";
}
