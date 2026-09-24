import { Component, computed, inject, input, output } from '@angular/core';
import { FieldNode, FieldRules, StaticScope, mockBackend, namedValidators } from '../../engine';
import { FieldRegistry } from '../../runtime/field-registry';
import { ExpressionInput } from './expression-input';

type NumericRule = 'min' | 'max' | 'minLength' | 'maxLength';

/** Built-in rules applicable to the field type, named validators and async validators. */
@Component({
  selector: 'sfb-rules-editor',
  imports: [ExpressionInput],
  template: `
    @let r = rules();
    @if (allowed().includes('required')) {
      <label class="sfb-check"><input type="checkbox" [checked]="!!r.required" (change)="set('required', $any($event.target).checked || undefined)" /> Required</label>
      <sfb-expression-input
        label="Required only when"
        inputId="rule-requiredWhen"
        [value]="r.requiredWhen"
        [scopes]="scopes()"
        placeholder="plan == 'team'"
        (valueChange)="set('requiredWhen', $event)"
      />
    }
    <div class="insp-grid">
      @for (rule of numeric(); track rule) {
        <div>
          <label class="insp-label" [for]="'rule-' + rule">{{ labels[rule] }}</label>
          <input class="sfb-input" type="number" [id]="'rule-' + rule" [value]="r[rule] ?? ''" (input)="setNumber(rule, $any($event.target).value)" />
        </div>
      }
    </div>
    @if (allowed().includes('pattern')) {
      <label class="insp-label" for="rule-pattern">Pattern (regular expression)</label>
      <input class="sfb-input mono" id="rule-pattern" [value]="r.pattern?.regex ?? ''" placeholder="^[A-Z]{2}\\d+$" (input)="setPattern($any($event.target).value, r.pattern?.message)" />
      @if (r.pattern) {
        <label class="insp-label" for="rule-pattern-msg">Pattern message</label>
        <input class="sfb-input" id="rule-pattern-msg" [value]="r.pattern.message ?? ''" (input)="setPattern(r.pattern.regex, $any($event.target).value)" />
      }
    }
    @if (validators().length) {
      <fieldset class="insp-fieldset">
        <legend class="insp-label">Named validators</legend>
        @for (v of validators(); track v.name) {
          <label class="sfb-check"><input type="checkbox" [checked]="hasValidator(v.name)" (change)="toggleValidator(v.name, $any($event.target).checked)" /> {{ v.label }} <code>{{ v.name }}</code></label>
        }
      </fieldset>
    }
    @if (asyncValidators().length) {
      <fieldset class="insp-fieldset">
        <legend class="insp-label">Async validators (mock server)</legend>
        @for (v of asyncValidators(); track v.name) {
          <label class="sfb-check"><input type="checkbox" [checked]="hasAsync(v.name)" (change)="toggleAsync(v.name, $any($event.target).checked)" /> {{ v.label }}</label>
        }
      </fieldset>
    }
  `,
})
export class RulesEditor {
  readonly node = input.required<FieldNode>();
  readonly scopes = input.required<readonly StaticScope[]>();
  readonly changed = output<{ rules: FieldRules | undefined; key: string }>();

  private readonly registry = inject(FieldRegistry);
  protected readonly labels: Record<NumericRule, string> = { min: 'Min', max: 'Max', minLength: 'Min length', maxLength: 'Max length' };

  protected readonly rules = computed<FieldRules>(() => this.node().rules ?? {});
  private readonly spec = computed(() => this.registry.kinds.get(this.node().type));
  protected readonly allowed = computed(() => this.spec()?.rules ?? []);
  protected readonly numeric = computed(() =>
    (['min', 'max', 'minLength', 'maxLength'] as const).filter((r) => this.allowed().includes(r)),
  );
  protected readonly validators = computed(() => {
    const kind = this.spec()?.valueKind;
    return kind ? namedValidators().filter((v) => v.appliesTo.includes(kind)) : [];
  });
  protected readonly asyncValidators = computed(() => {
    const kind = this.spec()?.valueKind;
    return kind ? mockBackend.asyncValidators.filter((v) => v.appliesTo.includes(kind)) : [];
  });

  protected set<K extends keyof FieldRules>(key: K, value: FieldRules[K] | undefined): void {
    const next: Record<string, unknown> = { ...this.rules(), [key]: value };
    if (value === undefined || value === false) delete next[key];
    this.changed.emit({ rules: Object.keys(next).length ? (next as FieldRules) : undefined, key: `rules:${key}` });
  }

  protected setNumber(key: NumericRule, raw: string): void {
    const n = raw === '' ? undefined : Number(raw);
    this.set(key, n === undefined || Number.isNaN(n) ? undefined : n);
  }

  protected setPattern(regex: string, message: string | undefined): void {
    this.set('pattern', regex ? { regex, ...(message ? { message } : {}) } : undefined);
  }

  protected hasValidator(name: string): boolean {
    return !!this.rules().validators?.some((v) => v.name === name);
  }

  protected toggleValidator(name: string, on: boolean): void {
    const list = (this.rules().validators ?? []).filter((v) => v.name !== name);
    const next = on ? [...list, { name }] : list;
    this.set('validators', next.length ? next : undefined);
  }

  protected hasAsync(name: string): boolean {
    return !!this.rules().async?.some((v) => v.name === name);
  }

  protected toggleAsync(name: string, on: boolean): void {
    const list = (this.rules().async ?? []).filter((v) => v.name !== name);
    const next = on ? [...list, { name }] : list;
    this.set('async', next.length ? next : undefined);
  }
}
