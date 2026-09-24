import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormSchema, SchemaNode, validateSchema } from '../../engine';
import { FieldRegistry } from '../../runtime/field-registry';
import {
  CommandError,
  NodePath,
  childrenAt,
  createNode,
  duplicateNode,
  insertNode,
  moveNode,
  nodeAtPath,
  removeNode,
  updateForm,
  updateNode,
} from './commands';
import { HistoryState, initHistory, pushHistory, redo, undo } from './history';

export const EMPTY_SCHEMA: FormSchema = {
  $schema: 'sfb/v1',
  id: 'myForm',
  title: 'Untitled form',
  fields: [],
};

/**
 * Builder state: the schema under edit (with history), the selection, and derived
 * validation. Components never mutate the schema directly — they call these commands.
 */
@Injectable()
export class BuilderStore {
  private readonly registry = inject(FieldRegistry);
  private readonly history = signal<HistoryState<FormSchema>>(initHistory(EMPTY_SCHEMA));

  readonly schema = computed(() => this.history().present);
  readonly selected = signal<NodePath | null>(null);
  readonly canUndo = computed(() => this.history().past.length > 0);
  readonly canRedo = computed(() => this.history().future.length > 0);
  /** Last command error, shown in a status line (e.g. "Steps can only live at the top level"). */
  readonly notice = signal<string | null>(null);

  readonly validation = computed(() => validateSchema(this.schema(), { kinds: this.registry.kinds }));
  readonly errors = computed(() => this.validation().issues.filter((i) => i.severity === 'error'));

  /** The preview keeps showing the last *valid* schema while the current one has errors. */
  readonly previewSchema = linkedSignal<ReturnType<typeof validateSchema>, FormSchema>({
    source: this.validation,
    computation: (v, previous) => (v.ok ? v.schema : (previous?.value ?? EMPTY_SCHEMA)),
  });

  readonly selectedNode = computed<SchemaNode | null>(() => {
    const path = this.selected();
    return path ? nodeAtPath(this.schema(), path) : null;
  });

  private commit(next: FormSchema, coalesceKey: string | null = null): void {
    this.notice.set(null);
    this.history.update((h) => pushHistory(h, next, coalesceKey));
  }

  private attempt(fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (e) {
      if (e instanceof CommandError) {
        this.notice.set(e.message);
        return false;
      }
      throw e;
    }
  }

  /** Starts a fresh history (initial load — nothing to undo). */
  init(schema: FormSchema): void {
    this.history.set(initHistory(schema));
    this.selected.set(null);
    this.notice.set(null);
  }

  /** Replaces the schema as an undoable step (examples, import, JSON editor). */
  load(schema: FormSchema): void {
    this.commit(schema);
    this.selected.set(null);
  }

  add(type: string, parent: NodePath, index?: number): boolean {
    return this.attempt(() => {
      const count = childrenAt(this.schema(), parent).length;
      const { schema, path } = insertNode(this.schema(), parent, index ?? count, createNode(type, this.registry.kinds));
      this.commit(schema);
      this.selected.set(path);
    });
  }

  /** Adds after the selection (or into the selected container), else at the end of the form. */
  addSmart(type: string): boolean {
    const schema = this.schema();
    const sel = this.selected();
    const node = sel ? nodeAtPath(schema, sel) : null;
    if (sel && node && 'fields' in node && type !== 'step') return this.add(type, sel);
    if (sel && node) return this.add(type, sel.slice(0, -1), sel[sel.length - 1] + 1);
    const lastStep = schema.fields.length - 1;
    if (type !== 'step' && schema.fields.some((n) => n.type === 'step')) return this.add(type, [lastStep]);
    return this.add(type, []);
  }

  move(from: NodePath, toParent: NodePath, toIndex: number): boolean {
    return this.attempt(() => {
      const { schema, path } = moveNode(this.schema(), from, toParent, toIndex);
      this.commit(schema);
      this.selected.set(path);
    });
  }

  remove(path: NodePath): void {
    this.attempt(() => {
      this.commit(removeNode(this.schema(), path));
      this.selected.set(null);
    });
  }

  duplicate(path: NodePath): void {
    this.attempt(() => {
      const { schema, path: copy } = duplicateNode(this.schema(), path);
      this.commit(schema);
      this.selected.set(copy);
    });
  }

  update(path: NodePath, patch: Partial<Record<string, unknown>>, coalesceKey?: string): void {
    this.attempt(() => this.commit(updateNode(this.schema(), path, patch), coalesceKey ?? null));
  }

  updateForm(patch: Partial<Record<string, unknown>>, coalesceKey?: string): void {
    this.commit(updateForm(this.schema(), patch), coalesceKey ?? null);
  }

  undo(): void {
    this.history.update(undo);
    this.dropStaleSelection();
  }

  redo(): void {
    this.history.update(redo);
    this.dropStaleSelection();
  }

  private dropStaleSelection(): void {
    const sel = this.selected();
    if (sel && !nodeAtPath(this.schema(), sel)) this.selected.set(null);
  }
}
