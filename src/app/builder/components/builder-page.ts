import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { FormSchema, validateSchema } from '../../engine';
import { EXAMPLES } from '../../examples';
import { FieldRegistry } from '../../runtime/field-registry';
import { BuilderStore } from '../state/builder-store';
import { containerPaths, pathKey } from '../state/commands';
import { SchemaStorage } from '../state/schema-storage';
import { BuilderToolbar } from './builder-toolbar';
import { CanvasList } from './canvas-list';
import { Inspector } from './inspector';
import { Palette } from './palette';
import { PreviewPanel } from './preview-panel';

/** Visual builder: palette + canvas | inspector | preview/JSON/types. */
@Component({
  selector: 'sfb-builder-page',
  imports: [BuilderToolbar, Palette, CanvasList, Inspector, PreviewPanel],
  providers: [BuilderStore],
  host: { '(keydown)': 'onKey($event)' },
  template: `
    <div class="page builder-page">
      <div class="page-head">
        <div>
          <h1>Builder</h1>
          <p class="muted lead">
            Drag a field type onto the canvas (or click it to add it after the selection), select a node to edit its
            properties, and watch the live preview. The result is the same JSON schema the playground renders.
          </p>
        </div>
      </div>
      <sfb-builder-toolbar />
      @if (store.notice(); as notice) {
        <p class="notice warn" role="status">{{ notice }}</p>
      } @else if (store.info(); as info) {
        <p class="notice" role="status">{{ info }}</p>
      }
      <div class="builder-grid">
        <section class="card b-canvas" aria-labelledby="b-canvas-title">
          <h2 id="b-canvas-title" class="panel-title">Canvas</h2>
          <sfb-palette [connectedTo]="listIds()" />
          <sfb-canvas-list [nodes]="store.schema().fields" [parentPath]="[]" [connectedTo]="listIds()" label="Form fields" />
        </section>
        <section class="card b-inspector" aria-label="Properties">
          <sfb-inspector />
        </section>
        <section class="card b-preview" aria-label="Output">
          <sfb-preview-panel />
        </section>
      </div>
    </div>
  `,
})
export class BuilderPage {
  /** `?example=job` opens an example (the playground links here). */
  readonly example = input<string>();

  protected readonly store = inject(BuilderStore);
  private readonly storage = inject(SchemaStorage);
  private readonly registry = inject(FieldRegistry);

  /** Drop-list ids, deepest first, so a drop lands in the innermost container. */
  protected readonly listIds = computed(() =>
    containerPaths(this.store.schema()).map((c) => `list-${pathKey(c.path)}`),
  );

  constructor() {
    // Initial content: ?example=… > autosaved draft > the sign-up example.
    effect(() => {
      const id = this.example();
      untracked(() => this.store.init(this.initialSchema(id)));
    });
    // Autosave the draft on every change.
    effect(() => this.storage.saveDraft(this.store.schema()));
  }

  private initialSchema(exampleId: string | undefined): FormSchema {
    const ex = EXAMPLES.find((e) => e.id === exampleId);
    if (ex) return ex.schema;
    const draft = this.storage.loadDraft();
    const result = draft ? validateSchema(draft, { kinds: this.registry.kinds }) : null;
    if (result && (result.ok || result.stage === 'semantics')) return draft as FormSchema;
    return EXAMPLES[0].schema;
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.store.redo();
      else this.store.undo();
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.store.redo();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && target.classList.contains('node-main')) {
      const sel = this.store.selected();
      if (sel) {
        event.preventDefault();
        this.store.remove(sel);
      }
    }
  }
}
