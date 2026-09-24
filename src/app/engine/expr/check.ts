import { StaticScope, bindRef, checkRefTail } from '../schema/walk';
import { compile } from './index';

export type ExpressionCheck =
  | { readonly ok: true; readonly refs: readonly string[] }
  | { readonly ok: false; readonly message: string; readonly start: number; readonly end: number };

/**
 * Validates an expression for the editor: syntax, then every referenced field against the
 * scope chain where the expression will run. Positions allow pointing at the problem.
 */
export function checkExpression(src: string, scopes: readonly StaticScope[]): ExpressionCheck {
  const result = compile(src);
  if (!result.ok) return { ok: false, message: result.error.message, start: result.error.start, end: result.error.end };
  const refs: string[] = [];
  for (const ref of result.refs) {
    const name = ref.join('.');
    const bound = bindRef(scopes, ref);
    const at = src.indexOf(ref[0]);
    if (!bound) return { ok: false, message: `Unknown field "${ref[0]}"`, start: Math.max(at, 0), end: Math.max(at, 0) + ref[0].length };
    const tail = checkRefTail(bound.node, bound.rest);
    if (tail) return { ok: false, message: tail, start: Math.max(at, 0), end: Math.max(at, 0) + name.length };
    if (!refs.includes(name)) refs.push(name);
  }
  return { ok: true, refs };
}
