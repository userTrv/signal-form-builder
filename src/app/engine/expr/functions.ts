/**
 * The whitelist of functions callable from expressions. Nothing else is reachable:
 * there is no `eval`, no `Function`, no property access outside the form value.
 */
export interface EvalOptions {
  /** Clock used by `today()` / `age()`; injectable for deterministic tests. */
  readonly now?: () => Date;
}

type Fn = (args: readonly unknown[], options: EvalOptions) => unknown;

interface FunctionSpec {
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly doc: string;
  readonly fn: Fn;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return Boolean(value);
}

function numbersOf(args: readonly unknown[]): number[] {
  const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
  return flat.map(toNumber).filter((n): n is number => n !== null);
}

/** Parses `YYYY-MM-DD` as a UTC date; anything else yields `null`. */
export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  len: {
    minArgs: 1,
    maxArgs: 1,
    doc: 'Length of a list or text; 0 for empty values',
    fn: ([v]) => (Array.isArray(v) || typeof v === 'string' ? v.length : 0),
  },
  sum: {
    minArgs: 1,
    maxArgs: 99,
    doc: 'Sum of numbers; lists are flattened, empty values ignored',
    fn: (args) => numbersOf(args).reduce((a, b) => a + b, 0),
  },
  avg: {
    minArgs: 1,
    maxArgs: 99,
    doc: 'Average of numbers (null when there are none)',
    fn: (args) => {
      const ns = numbersOf(args);
      return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
    },
  },
  min: {
    minArgs: 1,
    maxArgs: 99,
    doc: 'Smallest number',
    fn: (args) => {
      const ns = numbersOf(args);
      return ns.length ? Math.min(...ns) : null;
    },
  },
  max: {
    minArgs: 1,
    maxArgs: 99,
    doc: 'Largest number',
    fn: (args) => {
      const ns = numbersOf(args);
      return ns.length ? Math.max(...ns) : null;
    },
  },
  round: {
    minArgs: 1,
    maxArgs: 2,
    doc: 'round(x, digits = 0)',
    fn: ([x, digits]) => {
      const n = toNumber(x);
      if (n === null) return null;
      const d = Math.max(0, Math.min(10, toNumber(digits) ?? 0));
      const f = 10 ** d;
      return Math.round((n + Number.EPSILON) * f) / f;
    },
  },
  abs: {
    minArgs: 1,
    maxArgs: 1,
    doc: 'Absolute value',
    fn: ([x]) => {
      const n = toNumber(x);
      return n === null ? null : Math.abs(n);
    },
  },
  empty: {
    minArgs: 1,
    maxArgs: 1,
    doc: 'True for null, empty text or empty list',
    fn: ([v]) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length),
  },
  contains: {
    minArgs: 2,
    maxArgs: 2,
    doc: 'contains(listOrText, value)',
    fn: ([list, v]) =>
      Array.isArray(list)
        ? list.includes(v)
        : typeof list === 'string' && typeof v === 'string'
          ? list.includes(v)
          : false,
  },
  lower: {
    minArgs: 1,
    maxArgs: 1,
    doc: 'Lower-case text',
    fn: ([v]) => (typeof v === 'string' ? v.toLowerCase() : v),
  },
  today: {
    minArgs: 0,
    maxArgs: 0,
    doc: "Today's date as YYYY-MM-DD",
    fn: (_args, o) => toIsoDate(o.now?.() ?? new Date()),
  },
  age: {
    minArgs: 1,
    maxArgs: 1,
    doc: 'Full years since a YYYY-MM-DD date',
    fn: ([v], o) => {
      const birth = parseIsoDate(v);
      if (!birth) return null;
      const now = o.now?.() ?? new Date();
      let years = now.getUTCFullYear() - birth.getUTCFullYear();
      const m = now.getUTCMonth() - birth.getUTCMonth();
      if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) years--;
      return years;
    },
  },
  daysBetween: {
    minArgs: 2,
    maxArgs: 2,
    doc: 'daysBetween(from, to) for YYYY-MM-DD dates',
    fn: ([a, b]) => {
      const from = parseIsoDate(a);
      const to = parseIsoDate(b);
      return from && to ? Math.round((to.getTime() - from.getTime()) / DAY_MS) : null;
    },
  },
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
