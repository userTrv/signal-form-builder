import { FormSchema } from '../engine';
import { EVENT_REGISTRATION } from './event-registration';
import { INSURANCE_QUOTE } from './insurance-quote';
import { JOB_APPLICATION } from './job-application';
import { SIGNUP } from './signup';

export { EVENT_REGISTRATION, INSURANCE_QUOTE, JOB_APPLICATION, SIGNUP };
export { stressSchema } from './stress';

export interface ExampleEntry {
  readonly id: string;
  readonly label: string;
  readonly schema: FormSchema;
}

export const EXAMPLES: readonly ExampleEntry[] = [
  { id: 'signup', label: 'Sign-up (async + cross-field)', schema: SIGNUP },
  { id: 'job', label: 'Job application (wizard)', schema: JOB_APPLICATION },
  { id: 'insurance', label: 'Insurance quote (computed)', schema: INSURANCE_QUOTE },
  { id: 'event', label: 'Event registration (repeatable)', schema: EVENT_REGISTRATION },
];

export function exampleById(id: string | null | undefined): ExampleEntry {
  return EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
}
