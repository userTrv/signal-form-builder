/**
 * Immutable array operations for repeatable groups. Rows are moved as the *same* objects,
 * which matters: Signal Forms tracks array items by object identity, so a moved row keeps
 * its touched/dirty state and its DOM instead of being re-created.
 */
export function insertItem<T>(items: readonly T[], item: T, index = items.length): T[] {
  const i = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, i), item, ...items.slice(i)];
}

export function removeItem<T>(items: readonly T[], index: number): T[] {
  return index < 0 || index >= items.length ? [...items] : items.filter((_, i) => i !== index);
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return [...items];
  const target = Math.max(0, Math.min(to, items.length - 1));
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}
