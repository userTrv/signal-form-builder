import { Injectable, InjectionToken, Provider, Type, inject } from '@angular/core';
import { BUILT_IN_KINDS, FieldKindRegistry, FieldKindSpec } from '../engine';
import { CheckboxField } from './fields/checkbox-field';
import { DateRangeField } from './fields/date-range-field';
import { FileField } from './fields/file-field';
import { MultiselectField } from './fields/multiselect-field';
import { NumberField } from './fields/number-field';
import { PhoneField } from './fields/phone-field';
import { RadioField } from './fields/radio-field';
import { RatingField } from './fields/rating-field';
import { SelectField } from './fields/select-field';
import { TextField } from './fields/text-field';

/**
 * A field type = engine facts (`FieldKindSpec`) + the Angular component that renders it.
 * The component receives two inputs: `field` (a Signal Forms `FieldTree`) and `node`
 * (its schema node). Extending the builder with a new type is one `provideFieldTypes` call.
 */
export interface FieldTypeRegistration extends FieldKindSpec {
  readonly component: Type<unknown>;
}

export const FIELD_TYPE_EXTENSIONS = new InjectionToken<readonly FieldTypeRegistration[]>('FIELD_TYPE_EXTENSIONS');

const BUILT_IN_COMPONENTS: Readonly<Record<string, Type<unknown>>> = {
  text: TextField,
  textarea: TextField,
  email: TextField,
  number: NumberField,
  phone: PhoneField,
  date: TextField,
  'date-range': DateRangeField,
  select: SelectField,
  multiselect: MultiselectField,
  radio: RadioField,
  checkbox: CheckboxField,
  switch: CheckboxField,
  file: FileField,
  rating: RatingField,
};

/** Registers custom field types (usable in schemas, the renderer and the builder palette). */
export function provideFieldTypes(...types: FieldTypeRegistration[]): Provider[] {
  return types.map((t) => ({ provide: FIELD_TYPE_EXTENSIONS, useValue: t, multi: true }));
}

@Injectable({ providedIn: 'root' })
export class FieldRegistry {
  private readonly components = new Map<string, Type<unknown>>(Object.entries(BUILT_IN_COMPONENTS));
  /** Engine-side registry, handed to schema validation, type-gen and the rule builder. */
  readonly kinds = new FieldKindRegistry(BUILT_IN_KINDS);

  constructor() {
    const extensions = inject(FIELD_TYPE_EXTENSIONS, { optional: true }) ?? [];
    for (const ext of extensions) {
      this.kinds.register(ext);
      this.components.set(ext.type, ext.component);
    }
  }

  component(type: string): Type<unknown> | undefined {
    return this.components.get(type);
  }
}
