import { ExprNode } from './ast';
import { EvalOptions, FUNCTIONS, isTruthy, toNumber } from './functions';

/**
 * Resolves identifier paths. The evaluator never touches anything else, so an expression
 * can only read what the resolver hands out — which is always plain form data.
 */
export type Resolver = (path: readonly string[]) => unknown;

/**
 * Safe property navigation over plain JSON-like data.
 * - only own properties of plain objects/arrays are visible (`constructor`, `__proto__`,
 *   `toString`... resolve to `undefined`);
 * - a non-numeric segment applied to an array maps over its items, so
 *   `attendees.price` yields `[price1, price2, ...]` — handy for `sum()`.
 */
export function getPath(root: unknown, segments: readonly string[]): unknown {
  let current: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (/^\d+$/.test(segment)) {
        current = current[Number(segment)];
      } else {
        current = current.map((item) => readOwn(item, segment));
      }
    } else {
      current = readOwn(current, segment);
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function readOwn(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) return undefined;
  return Object.hasOwn(obj, key) ? (obj as Record<string, unknown>)[key] : undefined;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  return a === b;
}

function arithmetic(op: string, l: unknown, r: unknown): unknown {
  if (op === '+' && (typeof l === 'string' || typeof r === 'string')) {
    return `${l ?? ''}${r ?? ''}`;
  }
  const a = toNumber(l);
  const b = toNumber(r);
  if (a === null || b === null) return null;
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? null : a / b;
    default:
      return b === 0 ? null : a % b;
  }
}

function compare(op: string, l: unknown, r: unknown): boolean {
  const bothNumbers = typeof l === 'number' && typeof r === 'number';
  const bothStrings = typeof l === 'string' && typeof r === 'string';
  if (!bothNumbers && !bothStrings) return false;
  const a = l as number | string;
  const b = r as number | string;
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    default:
      return a >= b;
  }
}

/**
 * Evaluates an AST. Semantics are deliberately forgiving because expressions run on
 * half-filled forms: arithmetic with an empty operand yields `null` instead of `NaN`,
 * comparisons between mismatched types are `false`, division by zero is `null`.
 */
export function evaluate(node: ExprNode, resolve: Resolver, options: EvalOptions = {}): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'ident':
      return resolve(node.path);
    case 'array':
      return node.items.map((item) => evaluate(item, resolve, options));
    case 'unary': {
      const v = evaluate(node.arg, resolve, options);
      if (node.op === '!') return !isTruthy(v);
      const n = toNumber(v);
      return n === null ? null : -n;
    }
    case 'logical': {
      const left = evaluate(node.left, resolve, options);
      if (node.op === '&&') return isTruthy(left) ? evaluate(node.right, resolve, options) : left;
      return isTruthy(left) ? left : evaluate(node.right, resolve, options);
    }
    case 'conditional':
      return isTruthy(evaluate(node.test, resolve, options))
        ? evaluate(node.consequent, resolve, options)
        : evaluate(node.alternate, resolve, options);
    case 'call': {
      const args = node.args.map((arg) => evaluate(arg, resolve, options));
      return FUNCTIONS[node.name].fn(args, options);
    }
    case 'binary': {
      const l = evaluate(node.left, resolve, options);
      const r = evaluate(node.right, resolve, options);
      switch (node.op) {
        case '==':
          return looseEquals(l, r);
        case '!=':
          return !looseEquals(l, r);
        case '<':
        case '<=':
        case '>':
        case '>=':
          return compare(node.op, l, r);
        case 'in':
          return Array.isArray(r)
            ? r.some((item) => looseEquals(item, l))
            : typeof r === 'string' && typeof l === 'string' && r.includes(l);
        default:
          return arithmetic(node.op, l, r);
      }
    }
  }
}
