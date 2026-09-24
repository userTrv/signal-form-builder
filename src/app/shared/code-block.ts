import { Component, input, signal } from '@angular/core';

/** A `<pre>` with a copy button. Content is plain text (no HTML injection). */
@Component({
  selector: 'sfb-code-block',
  host: { class: 'code-block' },
  template: `
    <div class="code-head">
      <span class="code-lang">{{ label() }}</span>
      <button type="button" class="btn-link" (click)="copy()">{{ copied() ? 'Copied ✓' : 'Copy' }}</button>
    </div>
    <pre tabindex="0" [attr.aria-label]="label()"><code>{{ code() }}</code></pre>
  `,
})
export class CodeBlock {
  readonly code = input.required<string>();
  readonly label = input('code');
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.copied.set(false);
    }
  }
}
