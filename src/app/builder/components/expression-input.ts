import { Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { FUNCTIONS, FUNCTION_NAMES, StaticScope, checkExpression } from '../../engine';

/**
 * Expression editor: validates as you type (syntax + references to fields in scope),
 * points at the offending characters, and offers the identifiers that are in scope.
 */
@Component({
  selector: 'sfb-expression-input',
  template: `
    <div class="expr" [class.bad]="check() && !check()!.ok">
      <label class="insp-label" [for]="inputId()">{{ label() }}</label>
      <input
        #box
        class="sfb-input mono"
        [id]="inputId()"
        [value]="value() ?? ''"
        [attr.placeholder]="placeholder()"
        spellcheck="false"
        autocomplete="off"
        [attr.aria-describedby]="inputId() + '-status'"
        [attr.aria-invalid]="check() ? !check()!.ok : null"
        (input)="emit(box.value)"
      />
      <div class="expr-status" [id]="inputId() + '-status'" aria-live="polite">
        @if (check(); as c) {
          @if (c.ok) {
            <span class="ok">✓ Valid{{ c.refs.length ? ' — reads ' + c.refs.join(', ') : '' }}</span>
          } @else {
            <span class="err">{{ c.message }}</span>
            <pre class="caret" aria-hidden="true">{{ value() }}
{{ caret(c.start, c.end) }}</pre>
          }
        } @else {
          <span class="muted">{{ help() }}</span>
        }
      </div>
      <details class="expr-help">
        <summary>Fields &amp; functions</summary>
        <div class="chips">
          @for (name of identifiers(); track name) {
            <button type="button" class="mini-chip" (click)="insert(name)">{{ name }}</button>
          }
        </div>
        <div class="chips">
          @for (fn of functions; track fn.name) {
            <button type="button" class="mini-chip fn" [title]="fn.doc" (click)="insert(fn.name + '()')">{{ fn.name }}()</button>
          }
        </div>
        <p class="muted small">Operators: <code>== != &lt; &lt;= &gt; &gt;= &amp;&amp; || ! + - * / % in ?:</code> · strings in quotes: <code>'team'</code></p>
      </details>
    </div>
  `,
})
export class ExpressionInput {
  readonly value = input<string | undefined>();
  readonly scopes = input.required<readonly StaticScope[]>();
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly placeholder = input<string>('');
  readonly help = input('Optional.');
  readonly valueChange = output<string | undefined>();

  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');
  protected readonly functions = FUNCTION_NAMES.map((name) => ({ name, doc: FUNCTIONS[name].doc }));

  protected readonly check = computed(() => {
    const v = this.value()?.trim();
    return v ? checkExpression(v, this.scopes()) : null;
  });

  protected readonly identifiers = computed(() => {
    const names = new Set<string>();
    for (const scope of [...this.scopes()].reverse()) scope.nodes.forEach((n) => names.add(n.key));
    return [...names];
  });

  protected emit(raw: string): void {
    this.valueChange.emit(raw.trim() ? raw : undefined);
  }

  protected caret(start: number, end: number): string {
    return ' '.repeat(start) + '^'.repeat(Math.max(1, end - start));
  }

  protected insert(text: string): void {
    const el = this.box().nativeElement;
    const at = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, at);
    const pad = before && !/[\s(!]$/.test(before) ? ' ' : '';
    el.value = before + pad + text + el.value.slice(el.selectionEnd ?? at);
    const caret = (before + pad + text).length - (text.endsWith('()') ? 1 : 0);
    el.focus();
    el.setSelectionRange(caret, caret);
    this.emit(el.value);
  }
}
