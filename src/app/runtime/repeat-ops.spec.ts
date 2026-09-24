import { insertItem, moveItem, removeItem } from './repeat-ops';

const rows = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ids = (items: readonly { id: string }[]) => items.map((r) => r.id);

describe('repeat-ops', () => {
  describe('insertItem', () => {
    it('appends by default and inserts at an index', () => {
      expect(ids(insertItem(rows(), { id: 'x' }))).toEqual(['a', 'b', 'c', 'x']);
      expect(ids(insertItem(rows(), { id: 'x' }, 0))).toEqual(['x', 'a', 'b', 'c']);
      expect(ids(insertItem(rows(), { id: 'x' }, 2))).toEqual(['a', 'b', 'x', 'c']);
    });

    it('clamps out-of-range indexes', () => {
      expect(ids(insertItem(rows(), { id: 'x' }, -5))).toEqual(['x', 'a', 'b', 'c']);
      expect(ids(insertItem(rows(), { id: 'x' }, 99))).toEqual(['a', 'b', 'c', 'x']);
      expect(ids(insertItem([], { id: 'x' }, 3))).toEqual(['x']);
    });
  });

  describe('removeItem', () => {
    it('removes by index', () => {
      expect(ids(removeItem(rows(), 0))).toEqual(['b', 'c']);
      expect(ids(removeItem(rows(), 2))).toEqual(['a', 'b']);
    });

    it('returns an unchanged copy for out-of-range indexes', () => {
      const src = rows();
      for (const i of [-1, 3]) {
        const out = removeItem(src, i);
        expect(out).toEqual(src);
        expect(out).not.toBe(src);
      }
    });
  });

  describe('moveItem', () => {
    it('moves forwards and backwards', () => {
      expect(ids(moveItem(rows(), 0, 2))).toEqual(['b', 'c', 'a']);
      expect(ids(moveItem(rows(), 2, 0))).toEqual(['c', 'a', 'b']);
      expect(ids(moveItem(rows(), 1, 2))).toEqual(['a', 'c', 'b']);
    });

    it('clamps the target and ignores invalid sources', () => {
      expect(ids(moveItem(rows(), 0, 99))).toEqual(['b', 'c', 'a']);
      expect(ids(moveItem(rows(), 2, -1))).toEqual(['c', 'a', 'b']);
      expect(ids(moveItem(rows(), 5, 0))).toEqual(['a', 'b', 'c']);
      expect(ids(moveItem(rows(), -1, 0))).toEqual(['a', 'b', 'c']);
      expect(ids(moveItem(rows(), 1, 1))).toEqual(['a', 'b', 'c']);
    });
  });

  it('never mutates the input and keeps row identity (Signal Forms tracks rows by object)', () => {
    const src = rows();
    const frozen = Object.freeze([...src]);
    const [a, b, c] = src;
    const moved = moveItem(frozen, 0, 2);
    expect(moved[2]).toBe(a);
    expect(moved[0]).toBe(b);
    expect(insertItem(frozen, { id: 'x' }, 1)[2]).toBe(b);
    expect(removeItem(frozen, 0)[1]).toBe(c);
    expect(ids(frozen)).toEqual(['a', 'b', 'c']);
  });
});
