import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormSchema, mockBackend } from '../../engine';
import { DynamicFormComponent } from './dynamic-form.component';

/** A small schema with no async validators, so tests never wait on the mock backend. */
const CONTACT: FormSchema = {
  id: 'contact',
  title: 'Contact us',
  submitLabel: 'Send',
  fields: [
    { type: 'text', key: 'name', label: 'Your name', rules: { required: true } },
    { type: 'email', key: 'email', label: 'Email', rules: { required: true } },
    {
      type: 'radio',
      key: 'reason',
      label: 'Reason',
      default: 'question',
      options: [
        { value: 'question', label: 'Question' },
        { value: 'other', label: 'Other' },
      ],
    },
    { type: 'text', key: 'otherReason', label: 'Please specify', visibleWhen: "reason == 'other'", rules: { required: true } },
  ],
};

/** Two steps; the cross-field check puts an error on step 1 while the user is on step 2. */
const WIZARD: FormSchema = {
  id: 'wiz',
  title: 'Wizard',
  fields: [
    { type: 'step', id: 'one', title: 'First', fields: [{ type: 'text', key: 'first', label: 'First value', rules: { required: true } }] },
    { type: 'step', id: 'two', title: 'Second', fields: [{ type: 'text', key: 'second', label: 'Second value', rules: { required: true } }] },
  ],
  checks: [{ when: 'first && second', assert: 'first != second', target: 'first', message: 'Must differ from the second value' }],
};

async function render(schema: FormSchema): Promise<{ fixture: ComponentFixture<DynamicFormComponent>; el: HTMLElement }> {
  const fixture = TestBed.createComponent(DynamicFormComponent);
  fixture.componentRef.setInput('schema', schema);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const labels = (el: HTMLElement) => [...el.querySelectorAll('.sfb-label')].map((l) => l.textContent?.replace('*', '').trim());
const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const inputFor = (el: HTMLElement, label: string): HTMLInputElement => {
  const l = [...el.querySelectorAll('label')].find((x) => x.textContent?.replace('*', '').trim() === label);
  return el.querySelector(`#${l?.htmlFor}`) as HTMLInputElement;
};
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

describe('DynamicFormComponent', () => {
  afterEach(() => document.body.replaceChildren());

  it('renders a labelled control for every visible field, bound by id', async () => {
    const { el } = await render(CONTACT);
    expect(el.querySelector('h2')?.textContent).toBe('Contact us');
    expect(labels(el)).toEqual(['Your name', 'Email', 'Reason']);
    expect(inputFor(el, 'Your name').type).toBe('text');
    expect(inputFor(el, 'Email').type).toBe('email');
    expect([...el.querySelectorAll<HTMLInputElement>('input[type=radio]')].map((r) => r.checked)).toEqual([true, false]);
    expect(button(el, 'Send').type).toBe('submit');
  });

  it('shows and hides a field when its visibleWhen condition changes', async () => {
    const { fixture, el } = await render(CONTACT);
    expect(el.textContent).not.toContain('Please specify');

    const other = el.querySelectorAll<HTMLInputElement>('input[type=radio]')[1];
    other.click();
    await fixture.whenStable();
    expect(labels(el)).toContain('Please specify');

    el.querySelectorAll<HTMLInputElement>('input[type=radio]')[0].click();
    await fixture.whenStable();
    expect(labels(el)).not.toContain('Please specify');
  });

  it('rebuilds the form when the schema input changes', async () => {
    const { fixture, el } = await render(CONTACT);
    fixture.componentRef.setInput('schema', { ...CONTACT, title: 'Other', fields: [CONTACT.fields[1]] });
    await fixture.whenStable();
    expect(el.querySelector('h2')?.textContent).toBe('Other');
    expect(labels(el)).toEqual(['Email']);
  });

  it('emits the value on a valid submit', async () => {
    const { fixture, el } = await render(CONTACT);
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    type(inputFor(el, 'Your name'), 'Kirill');
    type(inputFor(el, 'Email'), 'k@example.com');
    button(el, 'Send').click();
    await fixture.whenStable();
    expect(emitted).toEqual([{ name: 'Kirill', email: 'k@example.com', reason: 'question', otherReason: '' }]);
    expect(el.querySelector('.sfb-summary')).toBeNull();
    expect(el.textContent).toContain('Submitted ✓');
  });
});

describe('error summary', () => {
  afterEach(() => document.body.replaceChildren());

  it('receives focus after a failed submit and lists visible errors only', async () => {
    const { fixture, el } = await render(CONTACT);
    button(el, 'Send').click();
    await fixture.whenStable();
    const summary = el.querySelector<HTMLElement>('.sfb-summary');
    expect(summary).not.toBeNull();
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(summary);
    const links = [...summary!.querySelectorAll('a')].map((a) => a.textContent?.replace(/\s+/g, ' ').trim());
    expect(links).toEqual(['Your name: This field is required', 'Email: This field is required']);
    // Touched by submit, so the inline messages show too.
    expect(inputFor(el, 'Your name').getAttribute('aria-invalid')).toBe('true');
  });

  it('moves focus to the field when a summary link is activated', async () => {
    const { fixture, el } = await render(CONTACT);
    button(el, 'Send').click();
    await fixture.whenStable();
    const link = el.querySelectorAll<HTMLAnchorElement>('.sfb-summary a')[1];
    link.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(inputFor(el, 'Email'));
  });

  it('in a wizard, blocks "Next" on an invalid step and summarises only that step', async () => {
    const { fixture, el } = await render(WIZARD);
    button(el, 'Next').click();
    await fixture.whenStable();
    expect(el.querySelector('.sfb-step-title')?.textContent).toContain('Step 1 of 2');
    const summary = el.querySelector<HTMLElement>('.sfb-summary');
    expect(summary?.textContent).toContain('Please fix these before continuing');
    expect(summary?.querySelectorAll('a').length).toBe(1);
    expect(document.activeElement).toBe(summary);
  });

  it('in a wizard, a link to a field on another step jumps to that step and focuses it', async () => {
    const { fixture, el } = await render(WIZARD);
    type(inputFor(el, 'First value'), 'same');
    button(el, 'Next').click();
    await fixture.whenStable();
    expect(el.querySelector('.sfb-step-title')?.textContent).toContain('Step 2 of 2');

    type(inputFor(el, 'Second value'), 'same');
    button(el, 'Submit').click();
    await fixture.whenStable();
    const links = el.querySelectorAll<HTMLAnchorElement>('.sfb-summary a');
    expect([...links].map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'First value: Must differ from the second value',
    ]);

    links[0].click();
    await fixture.whenStable();
    expect(el.querySelector('.sfb-step-title')?.textContent).toContain('Step 1 of 2');
    expect(document.activeElement).toBe(inputFor(el, 'First value'));
  });
});

describe('async option lists', () => {
  afterEach(() => document.body.replaceChildren());

  const DEPENDENT: FormSchema = {
    id: 'dep',
    title: 'Dependent',
    fields: [
      { type: 'text', key: 'name', label: 'Name' },
      { type: 'select', key: 'country', label: 'Country', options: [{ value: 'nl', label: 'Netherlands' }, { value: 'de', label: 'Germany' }] },
      { type: 'select', key: 'city', label: 'City', optionsSource: { provider: 'cities', params: 'country' } },
    ],
  };

  it('loads when the params change, and not when an unrelated field changes', { timeout: 10_000 }, async () => {
    const { fixture, el } = await render(DEPENDENT);
    const started = () => mockBackend.stats.started;
    const before = started();
    const country = inputFor(el, 'Country') as unknown as HTMLSelectElement;
    country.value = 'nl';
    country.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(started()).toBe(before + 1);
    // whenStable() waits for the load (it is a pending task), so the options are there.
    const cityOptions = () => [...inputFor(el, 'City').querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(cityOptions()).toEqual(['Select…', 'Amsterdam', 'Rotterdam', 'Utrecht']);

    type(inputFor(el, 'Name'), 'K');
    await fixture.whenStable();
    type(inputFor(el, 'Name'), 'Ki');
    await fixture.whenStable();
    expect(started()).toBe(before + 1);
    expect(cityOptions()).toEqual(['Select…', 'Amsterdam', 'Rotterdam', 'Utrecht']);

    country.value = 'de';
    country.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(started()).toBe(before + 2);
  });
});

describe('repeatable groups', () => {
  afterEach(() => document.body.replaceChildren());

  const LIST: FormSchema = {
    id: 'list',
    title: 'List',
    fields: [{ type: 'repeat', key: 'rows', label: 'Rows', itemLabel: 'Row', fields: [{ type: 'text', key: 'name', label: 'Name' }] }],
  };
  const aria = (el: HTMLElement, label: string) => el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it('adds a row and focuses it; moving keeps focus on a move button, never on Remove', async () => {
    const { fixture, el } = await render(LIST);
    expect(el.querySelectorAll('.sfb-row').length).toBe(1); // a repeat starts with one row
    button(el, '+ Add row').click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.sfb-row').length).toBe(2);
    expect((document.activeElement as HTMLElement).id).toMatch(/rows-1-name$/);

    aria(el, 'Move Row 2 up').click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(aria(el, 'Move Row 1 down')); // "up" is disabled at the top

    aria(el, 'Move Row 1 down').click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(aria(el, 'Move Row 2 up'));

    aria(el, 'Remove Row 2').click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.sfb-row').length).toBe(1);
    expect((document.activeElement as HTMLElement).id).toMatch(/rows-0-name$/);
  });
});
