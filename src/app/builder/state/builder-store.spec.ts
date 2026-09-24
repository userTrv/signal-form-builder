import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormSchema, SchemaNode } from '../../engine';
import { SIGNUP } from '../../examples';
import { provideFieldTypes } from '../../runtime/field-registry';
import { TextField } from '../../runtime/fields/text-field';
import { BuilderStore, EMPTY_SCHEMA } from './builder-store';
import { childrenAt } from './commands';

const keysOf = (nodes: readonly SchemaNode[]) => nodes.map((n) => ('key' in n ? n.key : n.id));

function setup(providers: Provider[] = []) {
  TestBed.configureTestingModule({ providers: [BuilderStore, ...providers] });
  return TestBed.inject(BuilderStore);
}

describe('BuilderStore (integration)', () => {
  it('starts empty with nothing to undo', () => {
    const store = setup();
    expect(store.schema()).toEqual(EMPTY_SCHEMA);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.validation().ok).toBe(true);
  });

  it('adds fields, selects the new one and keeps keys unique', () => {
    const store = setup();
    expect(store.add('text', [])).toBe(true);
    expect(store.selected()).toEqual([0]);
    store.add('text', []);
    store.add('email', [], 0);
    expect(keysOf(store.schema().fields)).toEqual(['email', 'text', 'text2']);
    expect(store.selectedNode()).toMatchObject({ type: 'email', key: 'email' });
  });

  it('addSmart inserts after the selection, or into a selected container', () => {
    const store = setup();
    store.add('text', []);
    store.add('number', []);
    store.selected.set([0]);
    store.addSmart('email');
    expect(keysOf(store.schema().fields)).toEqual(['text', 'email', 'number']);

    store.add('group', []);
    store.addSmart('date'); // the new group is selected, so the date goes inside it
    expect(keysOf(childrenAt(store.schema(), [3]))).toEqual(['date']);
    expect(store.selected()).toEqual([3, 0]);
  });

  it('moves fields between levels (nesting) and follows the selection', () => {
    const store = setup();
    store.add('text', []);
    store.add('group', []);
    store.add('repeat', [1]); // repeat inside the group
    // Target paths are given as before the move (like CDK drag-drop reports them).
    expect(store.move([0], [1, 0], 0)).toBe(true); // text into group > repeat
    expect(keysOf(store.schema().fields)).toEqual(['group']);
    expect(keysOf(childrenAt(store.schema(), [0]))).toEqual(['items']);
    expect(keysOf(childrenAt(store.schema(), [0, 0]))).toEqual(['text']);
    expect(store.selected()).toEqual([0, 0, 0]);
    expect(store.selectedNode()).toMatchObject({ key: 'text' });

    store.move([0, 0, 0], [], 0); // and back out to the top
    expect(keysOf(store.schema().fields)).toEqual(['text', 'group']);
  });

  it('rejects invalid moves with a notice and without a history entry', () => {
    const store = setup();
    store.add('group', []);
    store.add('text', [0]);
    const before = store.schema();
    expect(store.move([0], [0], 0)).toBe(false);
    expect(store.notice()).toBe('A container cannot be moved into itself');
    expect(store.schema()).toBe(before);

    store.add('step', []);
    expect(store.notice()).toBe('Move the top-level fields into a step first');
    store.add('text', []);
    expect(store.notice()).toBeNull(); // cleared by the next successful command
  });

  it('undo/redo walks the whole history, and a new command clears redo', () => {
    const store = setup();
    store.add('text', []);
    store.add('group', []);
    store.move([0], [1], 0);
    const nested = store.schema();

    store.undo();
    expect(keysOf(store.schema().fields)).toEqual(['text', 'group']);
    store.undo();
    store.undo();
    expect(store.schema()).toEqual(EMPTY_SCHEMA);
    expect(store.canUndo()).toBe(false);
    expect(store.selected()).toBeNull(); // the selected node no longer exists

    store.redo();
    store.redo();
    store.redo();
    expect(store.schema()).toBe(nested);
    expect(store.canRedo()).toBe(false);

    store.undo();
    store.add('email', []);
    expect(store.canRedo()).toBe(false);
  });

  it('coalesces rapid edits with the same key into one undo step', () => {
    const store = setup();
    store.add('text', []);
    store.update([0], { label: 'N' }, 'label');
    store.update([0], { label: 'Na' }, 'label');
    store.update([0], { label: 'Name' }, 'label');
    expect(store.selectedNode()).toMatchObject({ label: 'Name' });
    store.undo();
    expect(store.selectedNode()).toMatchObject({ label: 'Text' });
  });

  it('keeps previewing the last valid schema while the current one has errors', () => {
    const store = setup();
    store.init(SIGNUP as FormSchema);
    expect(store.canUndo()).toBe(false);
    expect(store.previewSchema()).toBe(store.schema());

    store.update([0], { key: '' }); // an empty key is a schema error
    expect(store.errors().length).toBeGreaterThan(0);
    expect(store.previewSchema().fields[0]).toMatchObject({ key: 'username' });

    store.undo();
    expect(store.errors()).toEqual([]);
  });

  it('removes and duplicates nodes as undoable steps', () => {
    const store = setup();
    store.load(SIGNUP as FormSchema);
    expect(store.canUndo()).toBe(true); // load (unlike init) is undoable
    store.duplicate([0]);
    expect(keysOf(store.schema().fields).slice(0, 2)).toEqual(['username', 'username2']);
    expect(store.selected()).toEqual([1]);
    store.remove([1]);
    expect(store.selected()).toBeNull();
    expect(store.schema().fields.length).toBe(SIGNUP.fields.length);
    store.undo();
    store.undo();
    store.undo();
    expect(store.schema()).toEqual(EMPTY_SCHEMA);
  });

  it('can add a custom field type registered with provideFieldTypes', () => {
    const store = setup(
      provideFieldTypes({ type: 'color', label: 'Colour', icon: '◐', valueKind: 'string', rules: ['required'], component: TextField }),
    );
    expect(store.add('color', [])).toBe(true);
    expect(store.schema().fields[0]).toEqual({ type: 'color', key: 'color', label: 'Colour' });
    expect(store.validation().ok).toBe(true);
    expect(store.add('nope', [])).toBe(false);
    expect(store.notice()).toBe('Unknown field type "nope"');
  });
});
