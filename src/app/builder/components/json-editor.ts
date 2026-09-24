import { Component, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { FormSchema, SchemaIssue, validateSchema } from '../../engine';
import { FieldRegistry } from '../../runtime/field-registry';
import { prettyJson } from '../../shared/json';
import { BuilderStore } from '../state/builder-store';

/**
 * Two-way JSON view. Edits are parsed after a short pause; well-formed schemas are applied
 * to the builder (even with semantic errors, which then show up as issues), malformed JSON
 * or structurally broken schemas are reported and not applied.
 */
@Component({
  selector: 'sfb-json-editor',
  template: `
    <label class="insp-label" for="json-editor">Schema JSON <span class="muted small">— edit here or on the canvas, both stay in sync</span></label>
    <textarea
      id="json-editor"
      class="sfb-input mono json-area"
      spellcheck="false"
      [value]="text()"
      [attr.aria-invalid]="!!error()"
      aria-describedby="json-status"
      (input)="onInput($any($event.target).value)"
    ></textarea>
    <div id="json-status" class="json-status" aria-live="polite">
      @if (error(); as e) {
        <p class="sfb-error">{{ e }}</p>
        @for (issue of structural(); track $index) {
          <p class="sfb-error small">{{ issue.path }}: {{ issue.message }}</p>
        }
      } @else if (pending()) {
        <p class="muted small">Parsing…</p>
      } @else {
        <p class="muted small">In sync ✓</p>
      }
    </div>
  `,
})
export class JsonEditor {
  private readonly store = inject(BuilderStore);
  private readonly registry = inject(FieldRegistry);
  private appliedFromText: FormSchema | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Follows the store, except when the change came from this editor (keeps the caret). */
  protected readonly text = linkedSignal<FormSchema, string>({
    source: this.store.schema,
    computation: (schema, previous) =>
      previous && schema === this.appliedFromText ? previous.value : prettyJson(schema),
  });
  protected readonly error = signal<string | null>(null);
  protected readonly structural = signal<readonly SchemaIssue[]>([]);
  protected readonly pending = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.pending.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.apply(value), 400);
  }

  private apply(value: string): void {
    this.pending.set(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (e) {
      this.error.set(`Invalid JSON: ${(e as Error).message}`);
      this.structural.set([]);
      return;
    }
    const result = validateSchema(parsed, { kinds: this.registry.kinds });
    if (!result.ok && result.stage === 'structure') {
      this.error.set('Not applied — the schema structure is broken:');
      this.structural.set(result.issues.filter((i) => i.severity === 'error'));
      return;
    }
    this.error.set(null);
    this.structural.set([]);
    const schema = parsed as FormSchema;
    this.appliedFromText = schema;
    this.store.load(schema);
  }
}
