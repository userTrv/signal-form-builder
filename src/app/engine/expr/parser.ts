import { BinaryOp, ExprNode, ExprSyntaxError } from './ast';
import { FUNCTIONS } from './functions';

/**
 * Tokenizer + Pratt parser for the expression language.
 *
 *   expr     := ternary
 *   ternary  := or ('?' expr ':' expr)?
 *   or       := and ('||' and)*
 *   and      := eq ('&&' eq)*
 *   eq       := rel (('==' | '!=') rel)*
 *   rel      := add (('<' | '<=' | '>' | '>=' | 'in') add)*
 *   add      := mul (('+' | '-') mul)*
 *   mul      := unary (('*' | '/' | '%') unary)*
 *   unary    := ('!' | '-') unary | primary
 *   primary  := number | string | true | false | null | ident ('.' ident)* | call | '[' list ']' | '(' expr ')'
 */

type TokenType = 'num' | 'str' | 'ident' | 'op' | 'eof';

interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export const MAX_EXPR_LENGTH = 500;
const MAX_DEPTH = 40;
const OPERATORS = ['&&', '||', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '(', ')', '[', ']', ',', '.'];

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      while (i < src.length && /[0-9]/.test(src[i])) i++;
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) {
        i++;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
      }
      if (/[A-Za-z_$]/.test(src[i] ?? '')) {
        throw new ExprSyntaxError(`Invalid number "${src.slice(start, i + 1)}"`, start, i + 1);
      }
      tokens.push({ type: 'num', value: src.slice(start, i), start, end: i });
      continue;
    }
    if (ch === "'" || ch === '"') {
      i++;
      let value = '';
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\' && i + 1 < src.length) {
          value += src[i + 1];
          i += 2;
        } else {
          value += src[i++];
        }
      }
      if (i >= src.length) throw new ExprSyntaxError('Unterminated string', start, src.length);
      i++;
      tokens.push({ type: 'str', value, start, end: i });
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) i++;
      tokens.push({ type: 'ident', value: src.slice(start, i), start, end: i });
      continue;
    }
    if (src.startsWith('===', i) || src.startsWith('!==', i)) {
      throw new ExprSyntaxError(`Use "${src.slice(i, i + 2)}" — equality is already strict`, i, i + 3);
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) {
      const hint = ch === '=' ? ' — use "==" to compare' : ch === '&' || ch === '|' ? ` — use "${ch}${ch}"` : '';
      throw new ExprSyntaxError(`Unexpected character "${ch}"${hint}`, i, i + 1);
    }
    i += op.length;
    tokens.push({ type: 'op', value: op, start, end: i });
  }
  tokens.push({ type: 'eof', value: '', start: src.length, end: src.length });
  return tokens;
}

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  in: 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ExprNode {
    if (this.peek().type === 'eof') throw new ExprSyntaxError('Expression is empty', 0, 0);
    const node = this.expression();
    const next = this.peek();
    if (next.type !== 'eof') {
      throw new ExprSyntaxError(`Unexpected "${next.value}"`, next.start, next.end);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === value;
  }

  private expect(value: string): Token {
    const t = this.next();
    if (t.type !== 'op' || t.value !== value) {
      const got = t.type === 'eof' ? 'end of expression' : `"${t.value}"`;
      throw new ExprSyntaxError(`Expected "${value}" but found ${got}`, t.start, t.end);
    }
    return t;
  }

  private enter(t: Token): void {
    if (++this.depth > MAX_DEPTH) throw new ExprSyntaxError('Expression is nested too deeply', t.start, t.end);
  }

  private expression(): ExprNode {
    this.enter(this.peek());
    const test = this.binary(1);
    let result = test;
    if (this.isOp('?')) {
      this.next();
      const consequent = this.expression();
      this.expect(':');
      const alternate = this.expression();
      result = { kind: 'conditional', test, consequent, alternate, start: test.start, end: alternate.end };
    }
    this.depth--;
    return result;
  }

  private binaryOp(): string | null {
    const t = this.peek();
    if (t.type === 'op' && t.value in BINARY_PRECEDENCE) return t.value;
    if (t.type === 'ident' && t.value === 'in') return 'in';
    return null;
  }

  private binary(minPrec: number): ExprNode {
    let left = this.unary();
    for (let op = this.binaryOp(); op && BINARY_PRECEDENCE[op] >= minPrec; op = this.binaryOp()) {
      this.next();
      const right = this.binary(BINARY_PRECEDENCE[op] + 1);
      const span = { start: left.start, end: right.end };
      left =
        op === '&&' || op === '||'
          ? { kind: 'logical', op, left, right, ...span }
          : { kind: 'binary', op: op as BinaryOp, left, right, ...span };
    }
    return left;
  }

  private unary(): ExprNode {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '!' || t.value === '-')) {
      this.next();
      this.enter(t);
      const arg = this.unary();
      this.depth--;
      return { kind: 'unary', op: t.value, arg, start: t.start, end: arg.end };
    }
    return this.primary();
  }

  private primary(): ExprNode {
    const t = this.next();
    switch (t.type) {
      case 'num':
        return { kind: 'literal', value: Number(t.value), start: t.start, end: t.end };
      case 'str':
        return { kind: 'literal', value: t.value, start: t.start, end: t.end };
      case 'ident':
        return this.identifier(t);
      case 'op':
        if (t.value === '(') {
          const inner = this.expression();
          this.expect(')');
          return inner;
        }
        if (t.value === '[') {
          const items = this.list(']');
          const close = this.expect(']');
          return { kind: 'array', items, start: t.start, end: close.end };
        }
        throw new ExprSyntaxError(`Unexpected "${t.value}"`, t.start, t.end);
      default:
        throw new ExprSyntaxError('Unexpected end of expression', t.start, t.end);
    }
  }

  private list(close: string): ExprNode[] {
    const items: ExprNode[] = [];
    if (this.isOp(close)) return items;
    do {
      items.push(this.expression());
    } while (this.isOp(',') && this.next());
    return items;
  }

  private identifier(t: Token): ExprNode {
    if (t.value === 'true' || t.value === 'false') {
      return { kind: 'literal', value: t.value === 'true', start: t.start, end: t.end };
    }
    if (t.value === 'null') return { kind: 'literal', value: null, start: t.start, end: t.end };
    if (t.value === 'in') throw new ExprSyntaxError('Unexpected "in"', t.start, t.end);

    if (this.isOp('(')) {
      const spec = Object.hasOwn(FUNCTIONS, t.value) ? FUNCTIONS[t.value] : undefined;
      if (!spec) throw new ExprSyntaxError(`Unknown function "${t.value}"`, t.start, t.end);
      this.next();
      const args = this.list(')');
      const close = this.expect(')');
      if (args.length < spec.minArgs || args.length > spec.maxArgs) {
        const expected = spec.minArgs === spec.maxArgs ? `${spec.minArgs}` : `${spec.minArgs}–${spec.maxArgs}`;
        throw new ExprSyntaxError(
          `${t.value}() expects ${expected} argument(s), got ${args.length}`,
          t.start,
          close.end,
        );
      }
      return { kind: 'call', name: t.value, args, start: t.start, end: close.end };
    }

    const path = [t.value];
    let end = t.end;
    while (this.isOp('.')) {
      this.next();
      const part = this.next();
      if (part.type !== 'ident') {
        throw new ExprSyntaxError('Expected a field name after "."', part.start, part.end);
      }
      path.push(part.value);
      end = part.end;
    }
    return { kind: 'ident', path, start: t.start, end };
  }
}

/** Parses an expression; throws `ExprSyntaxError` with a source span on failure. */
export function parse(src: string): ExprNode {
  if (src.length > MAX_EXPR_LENGTH) {
    throw new ExprSyntaxError(`Expression is longer than ${MAX_EXPR_LENGTH} characters`, 0, src.length);
  }
  return new Parser(tokenize(src)).parse();
}
