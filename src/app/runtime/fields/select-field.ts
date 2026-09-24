import { Component, computed, effect, resource, untracked } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { SelectOption } from '../../engine';
import { BaseField } from './base-field';
import { FieldShell } from './field-shell';

/**
 * Native `<select>`. Options are static, or loaded from a provider through `resource()`;
 * the provider params come from an expression, so a "city" list can depend on "country".
 * A newer request aborts the previous one (the resource passes an `AbortSignal`).
 */
@Component({
  selector: 'sfb-select-field',
  imports: [FieldShell, FormField],
  template: `
    <sfb-field-shell
      [node]="node()"
      [controlId]="id()"
      [hintId]="hintId()"
      [errorId]="errorId()"
      [messages]="messages()"
      [pending]="loading()"
      [required]="state().required()"
    >
      <select
        class="sfb-input"
        [id]="id()"
        [formField]="field()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="showErrors()"
        [attr.aria-busy]="loading()"
      >
        <option value="">{{ loading() ? 'Loading…' : (node().placeholder ?? 'Select…') }}</option>
        @for (opt of options(); track opt.value) {
          <option [value]="opt.value">{{ opt.label }}</option>
        }
      </select>
      @if (remote.error()) {
        <p class="sfb-error">Could not load options.</p>
      }
    </sfb-field-shell>
  `,
})
export class SelectField extends BaseField<string> {
  private readonly source = computed(() => this.node().optionsSource);

  /**
   * `ctx.evaluate` reads the whole form value, so this recomputes on every change anywhere in
   * the form. The `equal` keeps the same params object while the evaluated value is the same;
   * otherwise the resource would see new params and reload on every keystroke elsewhere.
   */
  private readonly params = computed(
    () => {
      const src = this.source();
      if (!src) return undefined;
      const value = src.params ? this.ctx.evaluate(src.params, this.ctx.keysOf(this.state())) : null;
      // No request while a dependency is still empty (e.g. no country picked yet).
      return src.params && (value === '' || value === null || value === undefined) ? undefined : { value };
    },
    { equal: (a, b) => a === b || (!!a && !!b && Object.is(a.value, b.value)) },
  );

  protected readonly remote = resource({
    params: () => this.params(),
    loader: ({ params, abortSignal }) => {
      const provider = this.ctx.backend.optionProvider(this.source()!.provider);
      return provider ? provider.load(params.value, abortSignal) : Promise.resolve([]);
    },
  });

  protected readonly loading = computed(() => this.remote.isLoading());

  protected readonly options = computed<readonly SelectOption[]>(() =>
    this.source() ? (this.remote.hasValue() ? this.remote.value() : []) : (this.node().options ?? []),
  );

  constructor() {
    super();
    // Drop a selection that is no longer offered (e.g. the city after the country changed).
    effect(() => {
      if (!this.source() || this.loading()) return;
      const value = this.state().value();
      const offered = this.options().some((o) => o.value === value);
      if (value && !offered) untracked(() => this.state().value.set(''));
    });
  }
}
