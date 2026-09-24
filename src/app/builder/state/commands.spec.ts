import { FormSchema, validateSchema } from '../../engine';
import { JOB_APPLICATION } from '../../examples';
import {
  CommandError,
  childrenAt,
  containerPaths,
  createNode,
  duplicateNode,
  insertNode,
  keysInScope,
  moveNode,
  nodeAtPath,
  removeNode,
  uniqueKey,
  updateNode,
  wrapInStep,
} from './commands';
import { initHistory, pushHistory, redo, undo } from './history';

const base = (): FormSchema => ({
  id: 'f',
  title: 'F',
  fields: [
    { type: 'text', key: 'a', label: 'A' },
    { type: 'group', key: 'g', label: 'G', fields: [{ type: 'text', key: 'x', label: 'X' }] },
    { type: 'number', key: 'b', label: 'B' },
  ],
});

const keys = (s: FormSchema, parent: number[] = []) =>
  childrenAt(s, parent).map((n) => (n as { key: string }).key);

describe('builder commands', () => {
  it('insertNode adds at an index and returns the new path', () => {
    const { schema, path } = insertNode(base(), [], 1, createNode('email'));
    expect(keys(schema)).toEqual(['a', 'email', 'g', 'b']);
    expect(path).toEqual([1]);
  });

  it('insertNode de-duplicates keys within the scope only', () => {
    let s = insertNode(base(), [], 0, { type: 'text', key: 'a', label: 'dup' }).schema;
    expect(keys(s)).toEqual(['a2', 'a', 'g', 'b']);
    s = insertNode(s, [2], 0, { type: 'text', key: 'a', label: 'inner' }).schema;
    expect(keys(s, [2])).toEqual(['a', 'x']); // different scope: no rename
  });

  it('keeps untouched branches by reference (structural sharing)', () => {
    const before = base();
    const after = updateNode(before, [0], { label: 'A!' });
    expect(after.fields[1]).toBe(before.fields[1]);
    expect(after.fields[0]).not.toBe(before.fields[0]);
    expect(before.fields[0]).toMatchObject({ label: 'A' });
  });

  it('updateNode removes properties set to undefined', () => {
    const s = updateNode(base(), [0], { hint: 'h' });
    expect(nodeAtPath(updateNode(s, [0], { hint: undefined }), [0])).not.toHaveProperty('hint');
  });

  it('moves within the same container (CDK semantics)', () => {
    const { schema, path } = moveNode(base(), [0], [], 2);
    expect(keys(schema)).toEqual(['g', 'b', 'a']);
    expect(path).toEqual([2]);
  });

  it('nests a node into a group and adjusts indices shifted by the removal', () => {
    const { schema, path } = moveNode(base(), [0], [1], 1);
    expect(keys(schema)).toEqual(['g', 'b']);
    expect(keys(schema, [0])).toEqual(['x', 'a']);
    expect(path).toEqual([0, 1]);
  });

  it('moves a node out of a group', () => {
    const { schema } = moveNode(base(), [1, 0], [], 3);
    expect(keys(schema)).toEqual(['a', 'g', 'b', 'x']);
    expect(keys(schema, [1])).toEqual([]);
  });

  it('refuses to move a container into itself', () => {
    expect(() => moveNode(base(), [1], [1], 0)).toThrow(CommandError);
  });

  it('enforces wizard structure: steps only at the top, fields inside steps', () => {
    const wizard = JOB_APPLICATION as FormSchema;
    expect(() => insertNode(wizard, [], 0, createNode('text'))).toThrow('drop fields inside a step');
    expect(() => insertNode(base(), [], 0, createNode('step'))).toThrow('Move the top-level fields into a step first');
    expect(() => insertNode(wizard, [0], 0, createNode('step'))).toThrow('only live at the top level');
  });

  it('treats all steps as one key scope', () => {
    const wizard = JOB_APPLICATION as FormSchema;
    expect(keysInScope(wizard, [1]).has('fullName')).toBe(true);
    const { schema, path } = moveNode(wizard, [0, 0], [1], 0);
    expect(nodeAtPath(schema, path)).toMatchObject({ key: 'fullName' });
    expect(validateSchema(schema).ok).toBe(true);
  });

  it('removeNode and duplicateNode', () => {
    expect(keys(removeNode(base(), [1]))).toEqual(['a', 'b']);
    const { schema, path } = duplicateNode(base(), [1]);
    expect(keys(schema)).toEqual(['a', 'g', 'g2', 'b']);
    expect(nodeAtPath(schema, path)).toMatchObject({ label: 'G (copy)' });
    expect(() => removeNode(base(), [9])).toThrow(CommandError);
  });

  it('creates nodes with defaults that pass validation', () => {
    let s: FormSchema = { id: 'f', title: 'F', fields: [] };
    for (const t of ['text', 'select', 'multiselect', 'radio', 'phone', 'date-range', 'file', 'rating', 'group', 'repeat']) {
      s = insertNode(s, [], s.fields.length, createNode(t)).schema;
    }
    const result = validateSchema(s);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('uniqueKey sanitises and numbers', () => {
    expect(uniqueKey('first name', new Set())).toBe('firstname');
    expect(uniqueKey('9lives', new Set())).toBe('lives');
    expect(uniqueKey('a', new Set(['a', 'a2']))).toBe('a3');
  });

  it('lists containers deepest first for drop-list wiring', () => {
    const paths = containerPaths(base()).map((c) => c.path);
    expect(paths).toEqual([[1], []]);
  });
});

describe('builder history', () => {
  it('undo / redo walk through snapshots', () => {
    let h = initHistory('a');
    h = pushHistory(h, 'b');
    h = pushHistory(h, 'c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe('b');
    h = pushHistory(h, 'x');
    expect(h.future).toEqual([]);
  });

  it('coalesces rapid edits with the same key into one undo step', () => {
    let h = initHistory('');
    h = pushHistory(h, 'H', 'label', 1000);
    h = pushHistory(h, 'He', 'label', 1300);
    h = pushHistory(h, 'Hel', 'label', 1600);
    expect(h.past).toEqual(['']);
    h = pushHistory(h, 'Hell', 'label', 5000); // pause → new step
    expect(h.past).toEqual(['', 'Hel']);
    h = pushHistory(h, 'Hello', 'hint', 5100); // other field → new step
    expect(h.past.length).toBe(3);
  });

  it('ignores no-op pushes and caps the history', () => {
    let h = initHistory(0);
    expect(pushHistory(h, 0)).toBe(h);
    for (let i = 1; i <= 150; i++) h = pushHistory(h, i);
    expect(h.past.length).toBe(100);
  });

  it('wrapInStep turns a flat form into a one-step wizard, and leaves wizards and empty forms alone', () => {
    const flat = base();
    const wizard = wrapInStep(flat);
    expect(wizard.fields).toEqual([{ type: 'step', id: 'step1', title: 'Step 1', fields: flat.fields }]);
    expect(wrapInStep(wizard)).toBe(wizard);
    const empty: FormSchema = { id: 'e', title: 'E', fields: [] };
    expect(wrapInStep(empty)).toBe(empty);
    expect(validateSchema(wizard).ok).toBe(true);
  });
});
