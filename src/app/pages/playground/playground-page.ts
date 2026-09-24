import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ModelObject, generateTypeScript } from '../../engine';
import { EXAMPLES, exampleById } from '../../examples';
import { DynamicForm } from '../../runtime/dynamic-form';
import { DynamicFormComponent } from '../../runtime/components/dynamic-form.component';
import { CodeBlock } from '../../shared/code-block';
import { prettyJson } from '../../shared/json';
import { TabDef, Tabs } from '../../shared/tabs';

/** Renders the example schemas and shows value / generated types / schema / state live. */
@Component({
  selector: 'sfb-playground-page',
  imports: [DynamicFormComponent, CodeBlock, Tabs, RouterLink],
  templateUrl: './playground-page.html',
})
export class PlaygroundPage {
  /** `?example=job` — bound by `withComponentInputBinding()`. */
  readonly example = input<string>();

  private readonly router = inject(Router);
  protected readonly examples = EXAMPLES;
  protected readonly entry = computed(() => exampleById(this.example()));
  protected readonly instance = signal<DynamicForm<ModelObject> | null>(null);
  protected readonly result = signal<{ value: ModelObject; at: Date } | null>(null);

  protected readonly tabs: TabDef[] = [
    { id: 'value', label: 'Value' },
    { id: 'types', label: 'TypeScript' },
    { id: 'schema', label: 'Schema' },
    { id: 'state', label: 'State' },
  ];
  protected readonly tab = signal('value');
  protected readonly typeMode = signal<'draft' | 'submitted'>('draft');

  protected readonly valueJson = computed(() => prettyJson(this.instance()?.value() ?? {}));
  protected readonly schemaJson = computed(() => prettyJson(this.entry().schema));
  protected readonly typeText = computed(() => generateTypeScript(this.entry().schema, { mode: this.typeMode() }));
  protected readonly resultJson = computed(() => prettyJson(this.result()?.value));

  protected readonly state = computed(() => {
    const inst = this.instance();
    if (!inst) return null;
    const s = inst.form();
    return {
      valid: s.valid(),
      invalid: s.invalid(),
      pending: s.pending(),
      dirty: s.dirty(),
      touched: s.touched(),
      errors: s.errorSummary().length,
    };
  });

  protected select(id: string): void {
    this.result.set(null);
    void this.router.navigate(['/playground'], { queryParams: { example: id } });
  }

  protected onSubmitted(value: ModelObject): void {
    this.result.set({ value, at: new Date() });
  }
}
