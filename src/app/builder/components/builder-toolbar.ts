import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormSchema, validateSchema } from '../../engine';
import { EXAMPLES } from '../../examples';
import { FieldRegistry } from '../../runtime/field-registry';
import { prettyJson } from '../../shared/json';
import { BuilderStore, EMPTY_SCHEMA } from '../state/builder-store';
import { SchemaStorage } from '../state/schema-storage';

/** New / examples / undo-redo / import-export / localStorage saves. */
@Component({
  selector: 'sfb-builder-toolbar',
  template: `
    <div class="toolbar" role="toolbar" aria-label="Builder">
      <label class="sr-only" for="tb-example">Load an example</label>
      <select id="tb-example" class="sfb-input tb-select" [value]="''" (change)="loadExample($any($event.target).value)">
        <option value="">Load example…</option>
        @for (ex of examples; track ex.id) {
          <option [value]="ex.id">{{ ex.label }}</option>
        }
      </select>
      <button type="button" class="btn secondary small" (click)="store.load(empty)">New</button>
      <span class="tb-sep" aria-hidden="true"></span>
      <button type="button" class="btn secondary small" [disabled]="!store.canUndo()" (click)="store.undo()" aria-keyshortcuts="Control+Z Meta+Z">↶ Undo</button>
      <button type="button" class="btn secondary small" [disabled]="!store.canRedo()" (click)="store.redo()" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">↷ Redo</button>
      <span class="tb-sep" aria-hidden="true"></span>
      <button type="button" class="btn secondary small" (click)="fileInput().nativeElement.click()">Import</button>
      <input #file type="file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-hidden="true" (change)="importFile(file)" />
      <button type="button" class="btn secondary small" (click)="exportFile()">Export</button>
      <details class="tb-menu" #menu>
        <summary class="btn secondary small">Saved ({{ storage.saved().length }})</summary>
        <div class="tb-menu-panel">
          <form class="tb-save" (submit)="$event.preventDefault(); save(name.value); name.value = ''">
            <label class="insp-label" for="tb-save-name">Save current as</label>
            <div class="row">
              <input #name id="tb-save-name" class="sfb-input" [value]="store.schema().title" required />
              <button type="submit" class="btn primary small">Save</button>
            </div>
          </form>
          @if (storage.saved().length) {
            <ul>
              @for (s of storage.saved(); track s.name) {
                <li>
                  <button type="button" class="btn-link" (click)="loadSaved(s.schema); menu.open = false">{{ s.name }}</button>
                  <small class="muted">{{ s.savedAt.slice(0, 16).replace('T', ' ') }}</small>
                  <button type="button" class="icon-btn sm danger" (click)="storage.remove(s.name)" [attr.aria-label]="'Delete ' + s.name">✕</button>
                </li>
              }
            </ul>
          } @else {
            <p class="muted small">Nothing saved yet. Saves live in this browser's localStorage.</p>
          }
        </div>
      </details>
    </div>
    @if (message(); as m) {
      <p class="notice" [class.warn]="m.bad" role="status">{{ m.text }}</p>
    }
  `,
})
export class BuilderToolbar {
  protected readonly store = inject(BuilderStore);
  protected readonly storage = inject(SchemaStorage);
  private readonly registry = inject(FieldRegistry);
  protected readonly examples = EXAMPLES;
  protected readonly empty = EMPTY_SCHEMA;
  protected readonly message = signal<{ text: string; bad: boolean } | null>(null);
  protected readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected loadExample(id: string): void {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (ex) this.store.load(ex.schema);
  }

  protected save(name: string): void {
    const ok = this.storage.save(name.trim() || this.store.schema().title, this.store.schema());
    this.flash(ok ? `Saved "${name}" in this browser.` : 'Could not save (storage full or blocked).', !ok);
  }

  protected loadSaved(raw: unknown): void {
    this.loadUntrusted(raw, 'saved schema');
  }

  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.loadUntrusted(JSON.parse(await file.text()), file.name);
    } catch {
      this.flash(`${file.name} is not valid JSON.`, true);
    }
  }

  protected exportFile(): void {
    const schema = this.store.schema();
    const blob = new Blob([prettyJson(schema) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schema.id || 'form'}.schema.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private loadUntrusted(raw: unknown, source: string): void {
    const result = validateSchema(raw, { kinds: this.registry.kinds });
    if (!result.ok && result.stage === 'structure') {
      this.flash(`Could not load ${source}: ${result.issues[0]?.message ?? 'invalid schema'}`, true);
      return;
    }
    this.store.load(raw as FormSchema);
    const errors = result.issues.filter((i) => i.severity === 'error').length;
    this.flash(errors ? `Loaded ${source} with ${errors} problem(s) — see Issues.` : `Loaded ${source}.`, errors > 0);
  }

  private flash(text: string, bad: boolean): void {
    this.message.set({ text, bad });
    setTimeout(() => this.message.set(null), 4000);
  }
}
