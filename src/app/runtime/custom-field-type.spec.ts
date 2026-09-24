import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField } from '@angular/forms/signals';
import { SubmittedValue, defineSchema, generateTypeScript } from '../engine';
import { DynamicFormComponent } from './components/dynamic-form.component';
import { FieldRegistry, provideFieldTypes } from './field-registry';
import { BaseField } from './fields/base-field';
import { FieldShell } from './fields/field-shell';

// The recipe documented in the README ("Registering a custom field type").

// 1. A component: `BaseField` provides ids, aria wiring and error visibility; `FieldShell`
//    renders label, hint and errors.
@Component({
  selector: 'sfb-color-field',
  imports: [FieldShell, FormField],
  template: `
    <sfb-field-shell [node]="node()" [controlId]="id()" [hintId]="hintId()" [errorId]="errorId()"
                     [messages]="messages()" [required]="state().required()">
      <input type="color" [id]="id()" [formField]="field()" [attr.aria-describedby]="describedBy()" />
    </sfb-field-shell>
  `,
})
class ColorField extends BaseField<string> {}

// 2. Its value type, for `FormValue` / `SubmittedValue` inference.
declare module '../engine/typegen/infer' {
  interface CustomFieldValues {
    color: string;
  }
}

// 3. The registration (engine facts + component).
const COLOR = provideFieldTypes({
  type: 'color',
  label: 'Colour',
  icon: '◐',
  valueKind: 'string',
  rules: ['required'],
  tsType: 'string',
  defaultValue: (node) => (typeof node.default === 'string' ? node.default : '#4f46e5'),
  component: ColorField,
});

const THEME = defineSchema({
  id: 'theme',
  title: 'Theme',
  fields: [{ type: 'color', key: 'accent', label: 'Accent colour', rules: { required: true } }],
});

describe('custom field types (provideFieldTypes)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [COLOR] }));
  afterEach(() => document.body.replaceChildren());

  it('renders the registered component with its default value and emits it on submit', async () => {
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput('schema', THEME);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[type=color]')!;
    expect(el.querySelector(`label[for="${input.id}"]`)?.textContent).toContain('Accent colour');
    expect(input.value).toBe('#4f46e5');

    const values: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => values.push(v));
    input.value = '#ff0000';
    input.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(values).toEqual([{ accent: '#ff0000' }]);
  });

  it('is known to the engine (validation, type generation) and to the type-level inference', () => {
    const kinds = TestBed.inject(FieldRegistry).kinds;
    expect(kinds.get('color')?.label).toBe('Colour');
    expect(generateTypeScript(THEME, { kinds })).toContain('accent: string;');
    expectTypeOf<SubmittedValue<typeof THEME>>().toEqualTypeOf<{ accent: string }>();
  });
});
