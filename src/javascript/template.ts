import type {Node, ParserImpl, TemplateElement, TemplateLiteral} from "acorn";
import {TokContext, tokTypes as tt, Parser, Options} from "acorn";
import type {Cell} from "../lib/notebook.js";
import {acornOptions} from "./parse.js";
import {Sourcemap} from "./sourcemap.js";

const CODE_DOLLAR = 36;
const CODE_BACKSLASH = 92;
const CODE_BACKTICK = 96;
const CODE_BRACEL = 123;

// Based on acorn’s q_tmpl. We will use this to initialize the parser context so our
// `readTemplateToken` override is called. `readTemplateToken` is based on acorn's `readTmplToken`
// which is used inside template literals. Our version allows backQuotes.
const o_tmpl = new TokContext(
  "`", // token
  true, // isExpr
  true, // preserveSpace
  (parser) => (parser as TemplateCellParser).readTemplateToken() // override
);

// Adapted from https://github.com/observablehq/parser/blob/b6ec1db139913493b39c9d0ccb02a1636570a64e/src/parse.js#L233
class TemplateCellParser extends (Parser as typeof ParserImpl) {
  constructor(options: Options, input: string, startPos?: number) {
    super(options, input, startPos);
    this.type = tt.backQuote; // initially inside a backQuote
    this.exprAllowed = false;
  }
  initialContext() {
    return [o_tmpl];
  }
  parseTopLevel(node: Node): Node {
    if (this.type === tt.eof) this.value = ""; // fix for nextToken calling finishToken(tt.eof)
    const isTagged = true;
    const template = node as TemplateLiteral;
    template.expressions = [];
    let curElt = this.parseTemplateElement({isTagged});
    template.quasis = [curElt];
    while (this.type !== tt.eof) {
      this.expect(tt.dollarBraceL);
      template.expressions.push(this.parseExpression());
      this.expect(tt.braceR);
      template.quasis.push((curElt = this.parseTemplateElement({isTagged})));
    }
    curElt.tail = true;
    this.next();
    this.finishNode(template, "TemplateLiteral");
    this.expect(tt.eof);
    return template;
  }
  readTemplateToken() {
    out: for (; this.pos < this.input.length; this.pos++) {
      switch (this.input.charCodeAt(this.pos)) {
        case CODE_BACKSLASH: {
          if (this.pos < this.input.length - 1) ++this.pos; // not a terminal slash
          break;
        }
        case CODE_DOLLAR: {
          if (this.input.charCodeAt(this.pos + 1) === CODE_BRACEL) {
            if (this.pos === this.start && this.type === tt.invalidTemplate) {
              this.pos += 2;
              return this.finishToken(tt.dollarBraceL);
            }
            break out;
          }
          break;
        }
      }
    }
    return this.finishToken(tt.invalidTemplate, this.input.slice(this.start, this.pos));
  }
}

export function parseTemplate(input: string): TemplateLiteral {
  return TemplateCellParser.parse(input, acornOptions) as Node as TemplateLiteral;
}

/** @deprecated */
export function transpileTemplate(input: string, tag?: string, raw?: boolean): string;
export function transpileTemplate(cell: Cell): string;
export function transpileTemplate(input: string | Cell, tag = "", raw = false): string {
  let cell: Cell | undefined;
  if (typeof input !== "string") {
    cell = input;
    input = cell.value;
    tag = cell.mode === "tex" ? "tex.block" : cell.mode === "sql" ? getSqlTag(cell) : cell.mode;
    raw = cell.mode !== "md";
  }
  if (!input) return input;
  const source = new Sourcemap(input);
  const node = parseTemplate(input);
  (raw ? escapeRawTemplateElements : escapeTemplateElements)(source, node);
  source.insertLeft(node.start, "`");
  source.insertRight(node.end, "`");
  source.insertLeft(node.start, tag);
  let output = String(source);
  if (cell?.mode === "sql" && !cell.hidden) output += ".then(Inputs.table)";
  return output;
}

function getSqlTag(cell: Cell): string {
  const {id, database = "var:db", since} = cell;
  return database.startsWith("var:")
    ? `${database.slice("var:".length)}.sql`
    : `DatabaseClient(${JSON.stringify(database)}, {id: ${id}${since === undefined ? "" : `, since: ${JSON.stringify(since)}`}}).sql`;
}

function escapeTemplateElements(source: Sourcemap, node: TemplateLiteral): void {
  for (const quasi of node.quasis) {
    escapeBacktick(source, quasi);
    escapeBackslash(source, quasi);
  }
}

function escapeRawTemplateElements(source: Sourcemap, node: TemplateLiteral): void {
  for (const quasi of node.quasis) {
    escapeBacktick(source, quasi);
  }
  interpolateTerminalBackslash(source);
}

function escapeBacktick(source: Sourcemap, {start, end}: TemplateElement): void {
  const {input} = source;
  for (let i = start; i < end; ++i) {
    if (input.charCodeAt(i) === CODE_BACKTICK) {
      source.insertRight(i, "\\");
    }
  }
}

function escapeBackslash(source: Sourcemap, {start, end}: TemplateElement): void {
  const {input} = source;
  let afterDollar = false;
  let oddBackslashes = false;
  for (let i = start; i < end; ++i) {
    switch (input.charCodeAt(i)) {
      case CODE_DOLLAR: {
        afterDollar = true;
        oddBackslashes = false;
        break;
      }
      case CODE_BACKSLASH: {
        oddBackslashes = !oddBackslashes;
        if (afterDollar && input.charCodeAt(i + 1) === CODE_BRACEL) continue;
        if (oddBackslashes && input.charCodeAt(i + 1) === CODE_DOLLAR && input.charCodeAt(i + 2) === CODE_BRACEL) continue; // prettier-ignore
        source.insertRight(i, "\\");
        break;
      }
      default: {
        afterDollar = false;
        oddBackslashes = false;
        break;
      }
    }
  }
}

function interpolateTerminalBackslash(source: Sourcemap): void {
  const {input} = source;
  let oddBackslashes = false;
  for (let i = input.length - 1; i >= 0; i--) {
    if (input.charCodeAt(i) !== CODE_BACKSLASH) break;
    oddBackslashes = !oddBackslashes;
  }
  if (oddBackslashes) source.replaceRight(input.length - 1, input.length, "${'\\\\'}");
}
