import { EVENT_REGISTRATION, INSURANCE_QUOTE, JOB_APPLICATION, SIGNUP } from '../../examples';
import type { DynamicForm, createDynamicForm } from '../../runtime/dynamic-form';
import { FormSchema, defineSchema } from '../schema/types';
import { FileMeta, FormValue, SubmittedValue } from './infer';

/**
 * Type-level tests. They are checked by the TypeScript compiler when `pnpm test` builds
 * the specs (a wrong type fails the build); the runtime assertions are no-ops.
 */
describe('type-level inference from `as const` schemas', () => {
  it('infers the draft value of the sign-up form', () => {
    expectTypeOf<FormValue<typeof SIGNUP>>().toEqualTypeOf<{
      username: string;
      email: string;
      password: string;
      confirmPassword: string;
      plan: '' | 'free' | 'pro' | 'team';
      seats: number | null;
      newsletter: boolean;
      terms: boolean;
    }>();
  });

  it('narrows statically required, unconditional fields in the submitted value', () => {
    type Sent = SubmittedValue<typeof SIGNUP>;
    expectTypeOf<Sent['plan']>().toEqualTypeOf<'free' | 'pro' | 'team'>();
    expectTypeOf<Sent['terms']>().toEqualTypeOf<true>();
    // required but behind visibleWhen: may be hidden, so it stays nullable
    expectTypeOf<Sent['seats']>().toEqualTypeOf<number | null>();
    expectTypeOf<Sent['newsletter']>().toEqualTypeOf<boolean>();
  });

  it('flattens wizard steps and keeps nested repeat/date-range/file shapes', () => {
    type Job = SubmittedValue<typeof JOB_APPLICATION>;
    expectTypeOf<Job['years']>().toEqualTypeOf<number>();
    expectTypeOf<Job['skills']>().toEqualTypeOf<('angular' | 'rxjs' | 'signals' | 'ngxs' | 'typescript' | 'testing')[]>();
    expectTypeOf<Job['positions']>().toEqualTypeOf<{ company: string; title: string; period: { start: string; end: string } }[]>();
    expectTypeOf<Job['cv']>().toEqualTypeOf<FileMeta[]>();
    expectTypeOf<Job['otherRole']>().toEqualTypeOf<string>();
    expectTypeOf<Job['city']>().toEqualTypeOf<string>(); // async options → plain string
    expectTypeOf<Job>().not.toHaveProperty('about'); // steps are layout only
  });

  it('marks everything inside a conditional group as possibly empty', () => {
    type Ev = SubmittedValue<typeof EVENT_REGISTRATION>;
    expectTypeOf<Ev['company']>().toEqualTypeOf<{ name: string; vatId: string }>();
    expectTypeOf<Ev['attendees'][number]['ticket']>().toEqualTypeOf<'standard' | 'vip' | 'student'>();
    expectTypeOf<Ev['attendees'][number]['price']>().toEqualTypeOf<number | null>(); // computed, not required
    type Ins = SubmittedValue<typeof INSURANCE_QUOTE>;
    expectTypeOf<Ins['deductible']>().toEqualTypeOf<'' | '0' | '500' | '1000'>(); // conditional
    expectTypeOf<Ins['driver']['licenseYears']>().toEqualTypeOf<number>();
  });

  it('propagates a conditional step to its fields', () => {
    const s = defineSchema({
      id: 'x',
      title: 'X',
      fields: [
        { type: 'step', id: 'a', title: 'A', fields: [{ type: 'number', key: 'n', label: 'N', rules: { required: true } }] },
        {
          type: 'step',
          id: 'b',
          title: 'B',
          visibleWhen: 'n > 1',
          fields: [{ type: 'number', key: 'm', label: 'M', rules: { required: true } }],
        },
      ],
    });
    expectTypeOf<SubmittedValue<typeof s>>().toEqualTypeOf<{ n: number; m: number | null }>();
  });

  it('falls back to a record for schemas that are not literals', () => {
    expectTypeOf<FormValue<FormSchema>>().toEqualTypeOf<Record<string, unknown>>();
  });

  it('types the runtime API: field tree, value and submit handler', () => {
    // Never executed — only type-checked.
    const typeOnly = (signup: DynamicForm<FormValue<typeof SIGNUP>, SubmittedValue<typeof SIGNUP>>) => {
      expectTypeOf(signup.form.plan().value()).toEqualTypeOf<'' | 'free' | 'pro' | 'team'>();
      expectTypeOf(signup.form.seats().value()).toEqualTypeOf<number | null>();
      expectTypeOf(signup.value().username).toBeString();
      expectTypeOf(signup.submitted()).toEqualTypeOf<SubmittedValue<typeof SIGNUP> | null>();
      // @ts-expect-error — no such field in the schema
      void signup.form.nickname;
    };
    expectTypeOf(typeOnly).toBeFunction();

    type Created = ReturnType<typeof createDynamicForm<typeof EVENT_REGISTRATION>>;
    expectTypeOf<Created['form']['attendees']>().not.toBeAny();
    const rowTypes = (f: Created) => {
      expectTypeOf(f.form.attendees[0].ticket().value()).toEqualTypeOf<'' | 'standard' | 'vip' | 'student'>();
      expectTypeOf(f.form.days.end().value()).toEqualTypeOf<string>();
    };
    expectTypeOf(rowTypes).toBeFunction();
  });
});
