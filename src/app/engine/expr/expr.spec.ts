import { ExprSyntaxError, compile, evaluate, parse, tokenize } from './index';

const run = (src: string, data: Record<string, unknown> = {}, now = new Date('2026-09-24T12:00:00Z')) =>
  evaluate(parse(src), (path) => path.reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], data), {
    now: () => now,
  });

function syntaxError(src: string): ExprSyntaxError {
  try {
    parse(src);
  } catch (e) {
    if (e instanceof ExprSyntaxError) return e;
    throw e;
  }
  throw new Error(`expected "${src}" to fail`);
}

describe('expression tokenizer', () => {
  it('produces numbers, strings, identifiers and operators with spans', () => {
    const tokens = tokenize("a.b >= 1.5 && 'x\\'y'");
    expect(tokens.map((t) => t.value)).toEqual(['a', '.', 'b', '>=', '1.5', '&&', "x'y", '']);
    expect(tokens[3]).toMatchObject({ start: 4, end: 6 });
  });
});

describe('expression parser: precedence and associativity', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 4 - 3', 3],
    ['2 * 3 % 4', 2],
    ['-2 * 3', -6],
    ['!false && false', false],
    ['true || false && false', true],
    ['1 < 2 == true', true],
    ['1 + 1 == 2 && 3 > 2', true],
    ['false ? 1 : true ? 2 : 3', 2],
    ["'a' + 1 + 2", 'a12'],
    ['1 + 2 + "a"', '3a'],
  ])('%s → %j', (src, expected) => {
    expect(run(src)).toBe(expected);
  });

  it('parses dotted identifiers into a single reference', () => {
    expect(parse('driver.birthDate')).toMatchObject({ kind: 'ident', path: ['driver', 'birthDate'] });
  });

  it('supports array literals and the in operator', () => {
    expect(run("country in ['de', 'nl']", { country: 'nl' })).toBe(true);
    expect(run("'x' in 'box'")).toBe(true);
    expect(run('3 in [1, 2]')).toBe(false);
  });
});

describe('expression parser: errors', () => {
  it.each([
    ['', 'Expression is empty'],
    ['1 +', 'Unexpected end of expression'],
    ['(1 + 2', 'Expected ")"'],
    ['a = 1', 'use "=="'],
    ['a === 1', 'equality is already strict'],
    ['a & b', 'use "&&"'],
    ["'open", 'Unterminated string'],
    ['foo(1)', 'Unknown function "foo"'],
    ['round()', 'round() expects 1–2 argument(s), got 0'],
    ['a.', 'Expected a field name after "."'],
    ['1 2', 'Unexpected "2"'],
    ['12abc', 'Invalid number'],
  ])('%j fails with %j', (src, message) => {
    expect(syntaxError(src).message).toContain(message);
  });

  it('reports the position of the problem', () => {
    const err = syntaxError('qty * # price');
    expect(err.start).toBe(6);
    expect(err.end).toBe(7);
  });

  it('rejects absurdly long or deeply nested input', () => {
    expect(syntaxError('1+'.repeat(300) + '1').message).toContain('longer than');
    expect(syntaxError('('.repeat(60) + '1' + ')'.repeat(60)).message).toContain('nested too deeply');
  });

  it('compile() caches and never throws', () => {
    const a = compile('a + 1');
    expect(a).toBe(compile('a + 1'));
    expect(compile('a +').ok).toBe(false);
  });
});

describe('expression evaluator semantics', () => {
  it('propagates empty operands instead of producing NaN', () => {
    expect(run('qty * price', { qty: 2, price: null })).toBeNull();
    expect(run('qty * price', { qty: 2, price: 4.5 })).toBe(9);
    expect(run('10 / 0')).toBeNull();
  });

  it('compares only like with like', () => {
    expect(run("'2026-01-02' > '2025-12-31'")).toBe(true);
    expect(run('age > 18', { age: null })).toBe(false);
    expect(run("1 < '2'")).toBe(false);
  });

  it('treats null and undefined as equal, everything else strictly', () => {
    expect(run('missing == null')).toBe(true);
    expect(run("1 == '1'")).toBe(false);
  });

  it('short-circuits logical operators', () => {
    let calls = 0;
    const resolve = () => {
      calls++;
      return true;
    };
    evaluate(parse('false && x'), resolve);
    evaluate(parse('true || x'), resolve);
    expect(calls).toBe(0);
  });

  it('empty lists are falsy', () => {
    expect(run('!items', { items: [] })).toBe(true);
  });

  it('has whitelisted helper functions', () => {
    expect(run('sum(items)', { items: [1, null, 2, '3'] })).toBe(6);
    expect(run('round(1.005, 2)')).toBe(1.01);
    expect(run('len(name) + len(tags)', { name: 'abc', tags: ['a'] })).toBe(4);
    expect(run('min(3, 1, 2) + max([4, 9])')).toBe(10);
    expect(run('empty(x) && !empty(y)', { x: '', y: [1] })).toBe(true);
    expect(run('today()')).toBe('2026-09-24');
    expect(run("age('2000-09-25')")).toBe(25);
    expect(run("age('2000-09-24')")).toBe(26);
    expect(run("daysBetween('2026-01-01', '2026-03-01')")).toBe(59);
  });
});

describe('expression sandbox: no code execution', () => {
  it('has no access to globals — identifiers only reach the resolver', () => {
    const seen: string[][] = [];
    const resolve = (p: readonly string[]) => {
      seen.push([...p]);
      return undefined;
    };
    for (const src of ['window', 'globalThis.process', 'constructor', 'this']) {
      expect(evaluate(parse(src), resolve)).toBeUndefined();
    }
    expect(seen).toEqual([['window'], ['globalThis', 'process'], ['constructor'], ['this']]);
  });

  it('cannot call arbitrary functions or index with computed keys', () => {
    expect(syntaxError('eval("1")').message).toContain('Unknown function "eval"');
    expect(syntaxError('Function("return 1")()').message).toContain('Unknown function');
    expect(syntaxError('a["constructor"]').message).toContain('Unexpected "["');
    expect(syntaxError('a.b()').message).toContain('Unexpected "("');
  });

  it('prototype properties are invisible through getPath', async () => {
    const { getPath } = await import('./evaluate');
    const data = { user: { name: 'k' } };
    expect(getPath(data, ['user', 'constructor'])).toBeUndefined();
    expect(getPath(data, ['user', '__proto__'])).toBeUndefined();
    expect(getPath(data, ['user', 'toString'])).toBeUndefined();
    expect(getPath(data, ['user', 'name'])).toBe('k');
    expect(getPath(new Date(), ['getTime'])).toBeUndefined();
  });

  it('maps member access over arrays', async () => {
    const { getPath } = await import('./evaluate');
    expect(getPath({ rows: [{ p: 1 }, { p: 2 }] }, ['rows', 'p'])).toEqual([1, 2]);
    expect(getPath({ rows: [{ p: 1 }, { p: 2 }] }, ['rows', '1', 'p'])).toBe(2);
  });

  it('never uses eval or the Function constructor', async () => {
    const evalSpy = vi.spyOn(globalThis, 'eval');
    run('1 + 2 * x', { x: 3 });
    expect(evalSpy).not.toHaveBeenCalled();
    evalSpy.mockRestore();
  });
});
