import { TestBed } from '@angular/core/testing';
import { FieldState } from '@angular/forms/signals';
import { FormSchema, MockBackend, ModelObject } from '../engine';
import { EVENT_REGISTRATION, INSURANCE_QUOTE, JOB_APPLICATION, SIGNUP } from '../examples';
import { DynamicFormOptions, createDynamicForm, createUntypedForm } from './dynamic-form';
import { insertItem, moveItem, removeItem } from './repeat-ops';

/** Loose view of an untyped field tree, for navigating by key in tests. */
interface Tree {
  (): FieldState<unknown>;
  readonly [key: string]: Tree;
  readonly [index: number]: Tree;
}
const now = () => new Date('2026-09-24T12:00:00Z');
/** `name` collides with `Function.prototype.name` on a callable type, so index with a `string`. */
const NAME: string = 'name';

function build(schema: FormSchema, options: DynamicFormOptions<ModelObject> = {}) {
  const inst = TestBed.runInInjectionContext(() => createUntypedForm(schema, { now, ...options }));
  return { inst, f: inst.form as unknown as Tree };
}

const kinds = (tree: Tree) => tree().errors().map((e) => e.kind);

describe('createDynamicForm: conditional logic', () => {
  it('hides a field until its visibleWhen expression holds, and skips its validation', () => {
    const { f } = build(SIGNUP);
    expect(f['seats']().hidden()).toBe(true);
    expect(f['seats']().invalid()).toBe(false);
    f['plan']().value.set('team');
    expect(f['seats']().hidden()).toBe(false);
    expect(kinds(f['seats'])).toEqual(['required']);
    f['seats']().value.set(1);
    expect(kinds(f['seats'])).toEqual(['min']);
  });

  it('disables a field while enabledWhen is false', () => {
    const { f } = build(JOB_APPLICATION);
    expect(f['city']().disabled()).toBe(true);
    f['country']().value.set('nl');
    expect(f['city']().disabled()).toBe(false);
  });

  it('applies requiredWhen and hides whole groups and steps', () => {
    const schema: FormSchema = {
      id: 'x',
      title: 'X',
      fields: [
        { type: 'switch', key: 'invoice', label: 'Invoice' },
        { type: 'text', key: 'vat', label: 'VAT', rules: { requiredWhen: 'invoice' } },
        { type: 'group', key: 'company', label: 'C', visibleWhen: 'invoice', fields: [{ type: 'text', key: 'name', label: 'N', rules: { required: true } }] },
      ],
    };
    const { f } = build(schema);
    expect(f['vat']().required()).toBe(false);
    expect(f['company'][NAME]().hidden()).toBe(true); // inherited from the group
    f['invoice']().value.set(true);
    expect(f['vat']().required()).toBe(true);
    expect(f['company'][NAME]().hidden()).toBe(false);

    const { f: wizard } = build(JOB_APPLICATION);
    expect(wizard['relocate']().hidden()).toBe(false); // visibleWhen: workMode != 'remote'
    wizard['workMode']().value.set('remote');
    expect(wizard['relocate']().hidden()).toBe(true);
  });
});

describe('createDynamicForm: cross-field validation', () => {
  it('password confirmation reports on the target field and re-validates reactively', () => {
    const { f } = build(SIGNUP);
    f['password']().value.set('Secret123');
    f['confirmPassword']().value.set('Secret12');
    expect(f['confirmPassword']().errors().map((e) => e.message)).toEqual(['Passwords do not match']);
    f['password']().value.set('Secret12');
    expect(f['confirmPassword']().errors()).toEqual([]);
  });

  it('checks per repeat row and date-range order', () => {
    const { f } = build(JOB_APPLICATION);
    const period = f['positions'][0]['period'];
    period['start']().value.set('2024-05-01');
    period['end']().value.set('2023-01-01');
    expect(kinds(period['end'])).toEqual(['dateRange']);
    period['end']().value.set('2024-06-01');
    expect(kinds(period['end'])).toEqual([]);
  });

  it('group checks can use functions over sibling values', () => {
    const { f } = build(INSURANCE_QUOTE);
    f['driver']['birthDate']().value.set('2004-03-10'); // 22 years old
    f['driver']['licenseYears']().value.set(9);
    expect(kinds(f['driver']['licenseYears'])).toEqual(['check']);
    f['driver']['licenseYears']().value.set(4);
    expect(kinds(f['driver']['licenseYears'])).toEqual([]);
  });
});

describe('createDynamicForm: async validators (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settle = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.tick();
  };

  it('debounces, reports pending, then resolves to an error', async () => {
    const backend = new MockBackend(300);
    const { f } = build(SIGNUP, { backend });
    f['username']().value.set('admin');
    TestBed.tick();
    await settle(100); // still debouncing (400 ms)
    expect(backend.stats.started).toBe(0);
    await settle(350);
    expect(backend.stats.started).toBe(1);
    expect(f['username']().pending()).toBe(true);
    await settle(350);
    expect(f['username']().pending()).toBe(false);
    expect(f['username']().errors().map((e) => e.message)).toEqual(['"admin" is already taken']);
  });

  it('cancels an in-flight check when the value changes', async () => {
    const backend = new MockBackend(300);
    const { f } = build(SIGNUP, { backend });
    f['username']().value.set('admin');
    TestBed.tick();
    await settle(450); // request for "admin" is in flight
    expect(backend.stats.started).toBe(1);
    f['username']().value.set('kirill_new');
    TestBed.tick();
    await settle(450);
    await settle(400);
    expect(backend.stats.aborted).toBe(1);
    expect(backend.stats.completed).toBe(1);
    expect(f['username']().errors()).toEqual([]);
    expect(f['username']().valid()).toBe(true);
  });

  it('does not call the server while synchronous rules fail', async () => {
    const backend = new MockBackend(100);
    const { f } = build(SIGNUP, { backend });
    f['username']().value.set('ab'); // minLength 3
    TestBed.tick();
    await settle(1000);
    expect(backend.stats.started).toBe(0);
  });
});

describe('createDynamicForm: computed fields and repeats', () => {
  it('keeps computed values in the model via an effect', () => {
    const { inst, f } = build(EVENT_REGISTRATION);
    f['attendees'][0]['ticket']().value.set('vip');
    TestBed.tick();
    expect(f['attendees'][0]['price']().value()).toBe(449);
    expect(f['attendees'][0]['price']().readonly()).toBe(true);
    expect(inst.value()['total']).toBe(449);

    f['attendees']().value.update((rows) => insertItem(rows as ModelObject[], { name: '', email: '', ticket: 'student', price: null, studentId: '' }));
    TestBed.tick();
    expect(inst.value()['total']).toBe(548);
    expect(inst.value()['attendeeCount']).toBe(2);
  });

  it('moving rows keeps their field state (identity tracking)', () => {
    const { f } = build(EVENT_REGISTRATION);
    const add = () => f['attendees']().value.update((rows) => insertItem(rows as ModelObject[], { name: '', email: '', ticket: '', price: null, studentId: '' }));
    add();
    f['attendees'][0][NAME]().value.set('Ann');
    f['attendees'][0][NAME]().markAsTouched();
    f['attendees']().value.update((rows) => moveItem(rows as ModelObject[], 0, 1));
    expect(f['attendees'][1][NAME]().value()).toBe('Ann');
    expect(f['attendees'][1][NAME]().touched()).toBe(true);
    expect(f['attendees'][0][NAME]().touched()).toBe(false);
    f['attendees']().value.update((rows) => removeItem(rows as ModelObject[], 0));
    expect((f['attendees']().value() as ModelObject[]).length).toBe(1);
  });

  it('enforces min/max rows', () => {
    const { f } = build(EVENT_REGISTRATION);
    f['attendees']().value.set([]);
    expect(kinds(f['attendees'])).toEqual(['minItems']);
  });
});

describe('createDynamicForm: submit and reset', () => {
  it('calls onSubmit with the value only when valid, onInvalid otherwise', async () => {
    const onSubmit = vi.fn();
    const onInvalid = vi.fn();
    const schema: FormSchema = { id: 's', title: 'S', fields: [{ type: 'text', key: 'name', label: 'N', rules: { required: true } }] };
    const { inst, f } = build(schema, { onSubmit, onInvalid });
    expect(await inst.submit()).toBe(false);
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(f[NAME]().touched()).toBe(true);
    f[NAME]().value.set('Kirill');
    expect(await inst.submit()).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Kirill' });
    expect(inst.submitted()).toEqual({ name: 'Kirill' });
    inst.reset();
    expect(f[NAME]().value()).toBe('');
    expect(f[NAME]().touched()).toBe(false);
  });

  it('typed API: createDynamicForm infers the model from an `as const` schema', () => {
    const signup = TestBed.runInInjectionContext(() => createDynamicForm(SIGNUP));
    signup.form.plan().value.set('pro');
    expect(signup.value().plan).toBe('pro');
    expect(signup.form.newsletter().value()).toBe(false);
  });
});
