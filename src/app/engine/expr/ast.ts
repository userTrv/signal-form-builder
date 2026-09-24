/**
 * AST of the expression language. Every node carries its source span so that errors
 * and editor hints can point at the exact characters.
 */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in';

export type ExprNode =
  | ({ readonly kind: 'literal'; readonly value: string | number | boolean | null } & Span)
  | ({ readonly kind: 'ident'; readonly path: readonly string[] } & Span)
  | ({ readonly kind: 'array'; readonly items: readonly ExprNode[] } & Span)
  | ({ readonly kind: 'unary'; readonly op: '!' | '-'; readonly arg: ExprNode } & Span)
  | ({
      readonly kind: 'binary';
      readonly op: BinaryOp;
      readonly left: ExprNode;
      readonly right: ExprNode;
    } & Span)
  | ({
      readonly kind: 'logical';
      readonly op: '&&' | '||';
      readonly left: ExprNode;
      readonly right: ExprNode;
    } & Span)
  | ({
      readonly kind: 'conditional';
      readonly test: ExprNode;
      readonly consequent: ExprNode;
      readonly alternate: ExprNode;
    } & Span)
  | ({ readonly kind: 'call'; readonly name: string; readonly args: readonly ExprNode[] } & Span);

export class ExprSyntaxError extends Error {
  constructor(
    message: string,
    readonly start: number,
    readonly end: number,
  ) {
    super(message);
    this.name = 'ExprSyntaxError';
  }
}

/** Walks the tree depth-first. */
export function visit(node: ExprNode, fn: (node: ExprNode) => void): void {
  fn(node);
  switch (node.kind) {
    case 'array':
      node.items.forEach((item) => visit(item, fn));
      break;
    case 'unary':
      visit(node.arg, fn);
      break;
    case 'binary':
    case 'logical':
      visit(node.left, fn);
      visit(node.right, fn);
      break;
    case 'conditional':
      visit(node.test, fn);
      visit(node.consequent, fn);
      visit(node.alternate, fn);
      break;
    case 'call':
      node.args.forEach((arg) => visit(arg, fn));
      break;
    default:
      break;
  }
}

/** All identifier references (`a.b.c` → `['a','b','c']`) used by an expression. */
export function collectRefs(node: ExprNode): (readonly string[])[] {
  const refs: (readonly string[])[] = [];
  visit(node, (n) => {
    if (n.kind === 'ident') refs.push(n.path);
  });
  return refs;
}
