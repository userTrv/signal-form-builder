import { FUNCTIONS, parseIsoDate, toIsoDate } from '../expr';
import { ValueKind } from '../schema/field-kinds';

export type ValidatorArgs = Readonly<Record<string, string | number | boolean>>;

export interface ValidatorArgSpec {
  readonly name: string;
  readonly type: 'number' | 'string';
  readonly default: number | string;
}

/** A named, reusable synchronous validator that schemas reference by name. */
export interface NamedValidatorSpec {
  readonly name: string;
  readonly label: string;
  readonly appliesTo: readonly ValueKind[];
  readonly args?: readonly ValidatorArgSpec[];
  /** Returns an error message, or `null` when valid. Empty values are always valid. */
  readonly validate: (value: unknown, args: ValidatorArgs, now: () => Date) => string | null;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

const FREE_MAIL = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'mail.ru', 'yandex.ru'];

export const NAMED_VALIDATORS: readonly NamedValidatorSpec[] = [
  {
    name: 'strongPassword',
    label: 'Strong password',
    appliesTo: ['string'],
    validate: (v) =>
      isEmpty(v) || (typeof v === 'string' && v.length >= 8 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v))
        ? null
        : 'Use 8+ characters with upper- and lower-case letters and a digit',
  },
  {
    name: 'noWhitespace',
    label: 'No spaces',
    appliesTo: ['string'],
    validate: (v) => (isEmpty(v) || !/\s/.test(String(v)) ? null : 'Spaces are not allowed'),
  },
  {
    name: 'slug',
    label: 'Lower-case slug',
    appliesTo: ['string'],
    validate: (v) =>
      isEmpty(v) || /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(String(v))
        ? null
        : 'Use lower-case letters, digits, "-" or "_"',
  },
  {
    name: 'businessEmail',
    label: 'Business email',
    appliesTo: ['string'],
    validate: (v) => {
      if (isEmpty(v)) return null;
      const domain = String(v).split('@')[1]?.toLowerCase();
      return domain && FREE_MAIL.includes(domain) ? 'Please use a work address' : null;
    },
  },
  {
    name: 'minAge',
    label: 'Minimum age',
    appliesTo: ['string'],
    args: [{ name: 'years', type: 'number', default: 18 }],
    validate: (v, args, now) => {
      if (isEmpty(v)) return null;
      const years = Number(args['years'] ?? 18);
      const age = FUNCTIONS['age'].fn([v], { now }) as number | null;
      return age !== null && age >= years ? null : `You must be at least ${years} years old`;
    },
  },
  {
    name: 'futureDate',
    label: 'Date in the future',
    appliesTo: ['string'],
    validate: (v, _args, now) => {
      const d = parseIsoDate(v);
      return isEmpty(v) || (d && toIsoDate(d) > toIsoDate(now())) ? null : 'Pick a date after today';
    },
  },
  {
    name: 'pastDate',
    label: 'Date in the past',
    appliesTo: ['string'],
    validate: (v, _args, now) => {
      const d = parseIsoDate(v);
      return isEmpty(v) || (d && toIsoDate(d) < toIsoDate(now())) ? null : 'Pick a date before today';
    },
  },
];

const byName = new Map(NAMED_VALIDATORS.map((v) => [v.name, v]));

export function getNamedValidator(name: string): NamedValidatorSpec | undefined {
  return byName.get(name);
}

export function registerNamedValidator(spec: NamedValidatorSpec): void {
  byName.set(spec.name, spec);
}

export function namedValidators(): NamedValidatorSpec[] {
  return [...byName.values()];
}

/** Phone mask helpers (`#` = digit). */
export function applyMask(mask: string, input: string): string {
  const first = mask.indexOf('#');
  const literalPrefix = first > 0 ? mask.slice(0, first) : '';
  const raw = literalPrefix && input.startsWith(literalPrefix) ? input.slice(literalPrefix.length) : input;
  let rest = raw.replace(/\D/g, '');
  // Drop a leading country code the user typed/pasted that the mask already contains.
  const prefixDigits = literalPrefix.replace(/\D/g, '');
  const slots = mask.split('#').length - 1;
  if (prefixDigits && rest.length > slots && rest.startsWith(prefixDigits)) {
    rest = rest.slice(prefixDigits.length);
  }
  let out = '';
  let di = 0;
  for (const ch of mask) {
    if (di >= rest.length) break;
    if (ch === '#') out += rest[di++];
    else out += ch;
  }
  return out;
}

export function isMaskComplete(mask: string, value: string): boolean {
  return value.length === mask.length;
}
