import { ExprNode, ExprSyntaxError, collectRefs } from './ast';
import { parse } from './parser';

export * from './ast';
export { evaluate, getPath } from './evaluate';
export type { Resolver } from './evaluate';
export { FUNCTIONS, FUNCTION_NAMES, isTruthy, parseIsoDate, toIsoDate, toNumber } from './functions';
export type { EvalOptions } from './functions';
export { parse, tokenize, MAX_EXPR_LENGTH } from './parser';

export type CompileResult =
  | { readonly ok: true; readonly ast: ExprNode; readonly refs: readonly (readonly string[])[] }
  | { readonly ok: false; readonly error: ExprSyntaxError };

const cache = new Map<string, CompileResult>();

/** Parses once per distinct source string; results are cached (ASTs are immutable). */
export function compile(src: string): CompileResult {
  let result = cache.get(src);
  if (!result) {
    try {
      const ast = parse(src);
      result = { ok: true, ast, refs: collectRefs(ast) };
    } catch (e) {
      if (!(e instanceof ExprSyntaxError)) throw e;
      result = { ok: false, error: e };
    }
    if (cache.size > 2000) cache.clear();
    cache.set(src, result);
  }
  return result;
}

/** Like `compile`, but throws — for code paths where the schema was already validated. */
export function compileOrThrow(src: string): ExprNode {
  const result = compile(src);
  if (!result.ok) throw result.error;
  return result.ast;
}
