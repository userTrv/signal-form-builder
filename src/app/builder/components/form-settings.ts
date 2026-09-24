import { Component, computed, inject } from '@angular/core';
import { CrossFieldCheck, scopeChainFor } from '../../engine';
import { BuilderStore } from '../state/builder-store';
import { ChecksEditor } from './checks-editor';

/** Inspector content when no node is selected: form-level properties and root checks. */
@Component({
  selector: 'sfb-form-settings',
  imports: [ChecksEditor],
  template: `
    @let s = store.schema();
    <div class="insp-head">
      <div>
        <p class="muted small">Form</p>
        <h2>{{ s.title }}</h2>
      </div>
    </div>
    <p class="muted small">Select a node on the canvas to edit it. These settings apply to the whole form.</p>
    <section class="insp-section" aria-labelledby="fs-basics">
      <h3 id="fs-basics">Form</h3>
      <label class="insp-label" for="fs-title">Title</label>
      <input class="sfb-input" id="fs-title" [value]="s.title" (input)="set('title', $any($event.target).value)" />
      <label class="insp-label" for="fs-id">Id <span class="muted small">(used for the generated type name)</span></label>
      <input class="sfb-input mono" id="fs-id" [value]="s.id" (input)="set('id', $any($event.target).value)" />
      <label class="insp-label" for="fs-desc">Description</label>
      <input class="sfb-input" id="fs-desc" [value]="s.description ?? ''" (input)="set('description', $any($event.target).value)" />
      <label class="insp-label" for="fs-submit">Submit button label</label>
      <input class="sfb-input" id="fs-submit" [value]="s.submitLabel ?? ''" placeholder="Submit" (input)="set('submitLabel', $any($event.target).value)" />
    </section>
    <section class="insp-section" aria-labelledby="fs-checks">
      <h3 id="fs-checks">Cross-field rules</h3>
      <sfb-checks-editor [checks]="s.checks ?? []" [scopes]="scopes()" idPrefix="form-checks" (changed)="setChecks($event.checks, $event.key)" />
    </section>
  `,
})
export class FormSettings {
  protected readonly store = inject(BuilderStore);
  protected readonly scopes = computed(() => scopeChainFor(this.store.schema(), []));

  protected set(prop: string, value: string): void {
    this.store.updateForm({ [prop]: value === '' && prop !== 'title' && prop !== 'id' ? undefined : value }, `form:${prop}`);
  }

  protected setChecks(checks: CrossFieldCheck[] | undefined, key: string): void {
    this.store.updateForm({ checks }, `form:${key}`);
  }
}
