/**
 * Snapshot-based undo/redo. States are immutable schemas with structural sharing, so a
 * snapshot costs one object per changed branch. Rapid edits with the same `coalesceKey`
 * (typing into one inspector input) collapse into a single undo step.
 */
export interface HistoryState<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  readonly lastKey: string | null;
  readonly lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 1000;

export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function pushHistory<T>(h: HistoryState<T>, next: T, coalesceKey: string | null = null, now = Date.now()): HistoryState<T> {
  if (next === h.present) return h;
  const coalesce = coalesceKey !== null && coalesceKey === h.lastKey && now - h.lastAt < COALESCE_MS;
  const past = coalesce ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: coalesceKey, lastAt: now };
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
    lastKey: null,
    lastAt: 0,
  };
}
