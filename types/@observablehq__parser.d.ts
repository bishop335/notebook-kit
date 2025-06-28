declare module "@observablehq/parser" {
  import type {BlockStatement, Expression, ImportDeclaration, TemplateLiteral} from "acorn";
  import type {Identifier, Node} from "acorn";
  import type {RecursiveVisitors, SimpleVisitors} from "acorn-walk";
  export type ViewExpression = Node & {type: "ViewExpression"; id: Identifier};
  export type MutableExpression = Node & {type: "MutableExpression"; id: Identifier};
  interface BaseCell {
    id: Identifier | ViewExpression | MutableExpression | null;
    async: boolean;
    generator: boolean;
    references: (Identifier | ViewExpression | MutableExpression)[];
  }
  export interface TemplateCell extends BaseCell {
    tag: Node;
    raw: boolean;
    body: TemplateLiteral;
  }
  export interface ImportCell extends BaseCell {
    tag: undefined;
    raw: undefined;
    body: ImportDeclaration;
  }
  export interface BlockCell extends BaseCell {
    tag: undefined;
    raw: undefined;
    body: BlockStatement;
  }
  export interface ExpressionCell extends BaseCell {
    tag: undefined;
    raw: undefined;
    body: Expression;
  }
  export type Cell = TemplateCell | BlockCell | ExpressionCell | ImportCell;
  export function parseCell(input: string, options?: {tag?: string; raw?: boolean}): Cell;
  export type Visitors = SimpleVisitors<unknown> & {
    ViewExpression?: (node: ViewExpression) => void;
    MutableExpression?: (node: MutableExpression) => void;
  };
  export const walk: RecursiveVisitors<unknown>;
}
