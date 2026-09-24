import { Component, computed, inject, signal } from '@angular/core';
import { ModelObject, generateTypeScript } from '../../engine';
import { DynamicFormComponent } from '../../runtime/components/dynamic-form.component';
import { FieldRegistry } from '../../runtime/field-registry';
import { CodeBlock } from '../../shared/code-block';
import { prettyJson } from '../../shared/json';
import { TabDef, Tabs } from '../../shared/tabs';
import { BuilderStore } from '../state/builder-store';
import { JsonEditor } from './json-editor';

/** Right-hand panel: live preview, two-way JSON, generated types and the issue list. */
@Component({
  selector: 'sfb-preview-panel',
  imports: [DynamicFormComponent, Tabs, JsonEditor, CodeBlock],
  template: `
    <sfb-tabs [tabs]="tabs()" [(active)]="tab" label="Output" prefix="bp" />
    <div class="tab-panel" role="tabpanel" id="bp-panel" [attr.aria-labelledby]="'bp-tab-' + tab()">
      @switch (tab()) {
        @case ('preview') {
          @if (!store.validation().ok) {
            <p class="notice warn">
              Showing the last valid version — {{ store.errors().length }} problem(s) to fix.
              <button type="button" class="btn-link" (click)="tab.set('issues')">See problems</button>
            </p>
          }
          @if (store.previewSchema().fields.length) {
            <sfb-dynamic-form [schema]="store.previewSchema()" (submitted)="submitted.set($event)" />
          } @else {
            <p class="muted">Add a field to see the form here.</p>
          }
          @if (submitted(); as value) {
            <sfb-code-block [code]="json(value)" label="last submitted value" />
          }
        }
        @case ('json') {
          <sfb-json-editor />
        }
        @case ('types') {
          <div class="seg" role="group" aria-label="Type flavour">
            <button type="button" [attr.aria-pressed]="mode() === 'draft'" (click)="mode.set('draft')">While editing</button>
            <button type="button" [attr.aria-pressed]="mode() === 'submitted'" (click)="mode.set('submitted')">After valid submit</button>
          </div>
          <sfb-code-block [code]="typeText()" label="TypeScript" />
        }
        @case ('issues') {
          @if (store.validation().issues.length) {
            <ul class="issue-list">
              @for (issue of store.validation().issues; track $index) {
                <li [class.warn]="issue.severity === 'warning'">
                  <button type="button" class="btn-link" (click)="store.selected.set(issue.nodePath.length ? issue.nodePath : null)">
                    {{ issue.severity === 'error' ? 'Error' : 'Warning' }}
                  </button>
                  {{ issue.message }} <code>{{ issue.path }}</code>
                </li>
              }
            </ul>
          } @else {
            <p class="ok-text">No problems — the schema is valid.</p>
          }
        }
      }
    </div>
  `,
})
export class PreviewPanel {
  protected readonly store = inject(BuilderStore);
  private readonly registry = inject(FieldRegistry);
  protected readonly tab = signal('preview');
  protected readonly mode = signal<'draft' | 'submitted'>('draft');
  protected readonly submitted = signal<ModelObject | null>(null);

  protected readonly tabs = computed<TabDef[]>(() => {
    const issues = this.store.validation().issues.length;
    return [
      { id: 'preview', label: 'Live preview' },
      { id: 'json', label: 'JSON' },
      { id: 'types', label: 'TypeScript' },
      { id: 'issues', label: issues ? `Issues (${issues})` : 'Issues' },
    ];
  });

  protected readonly typeText = computed(() =>
    generateTypeScript(this.store.previewSchema(), { mode: this.mode(), kinds: this.registry.kinds }),
  );

  protected json(value: unknown): string {
    return prettyJson(value);
  }
}
