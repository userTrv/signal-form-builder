import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeBlock } from '../../shared/code-block';
import { REACTIVE_CODE, REACTIVE_TEMPLATE, SIGNALS_CODE, SIGNALS_TEMPLATE } from './why-snippets';

/** A factual side-by-side of typed Reactive Forms and Signal Forms on the same sign-up form. */
@Component({
  selector: 'sfb-why-page',
  imports: [CodeBlock, RouterLink],
  templateUrl: './why-page.html',
})
export class WhyPage {
  protected readonly reactive = REACTIVE_CODE;
  protected readonly signals = SIGNALS_CODE;
  protected readonly reactiveTpl = REACTIVE_TEMPLATE;
  protected readonly signalsTpl = SIGNALS_TEMPLATE;
}
