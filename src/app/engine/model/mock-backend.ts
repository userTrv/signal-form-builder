import { SelectOption } from '../schema/types';
import { ValueKind } from '../schema/field-kinds';

/**
 * Local stand-in for a server. The demo is a static site with no API, so async validators
 * and async option lists resolve against in-memory data after an artificial delay. Every call
 * honours its `AbortSignal`, which is how superseded checks are cancelled.
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface AsyncValidatorSpec {
  readonly name: string;
  readonly label: string;
  readonly appliesTo: readonly ValueKind[];
  /** Resolves to an error message, or `null` when valid. */
  readonly check: (value: unknown, signal: AbortSignal) => Promise<string | null>;
}

export interface OptionProviderSpec {
  readonly name: string;
  readonly label: string;
  readonly load: (params: unknown, signal: AbortSignal) => Promise<readonly SelectOption[]>;
}

export interface BackendStats {
  started: number;
  completed: number;
  aborted: number;
}

const TAKEN_USERNAMES = ['admin', 'root', 'angular', 'kirill', 'test', 'user'];
const PROMO_CODES = ['EARLYBIRD', 'NGCONF', 'SIGNALS'];

const COUNTRIES: readonly SelectOption[] = [
  { value: 'de', label: 'Germany' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'pl', label: 'Poland' },
  { value: 'rs', label: 'Serbia' },
  { value: 'ge', label: 'Georgia' },
  { value: 'am', label: 'Armenia' },
];

const CITIES: Readonly<Record<string, readonly string[]>> = {
  de: ['Berlin', 'Munich', 'Hamburg'],
  nl: ['Amsterdam', 'Rotterdam', 'Utrecht'],
  pl: ['Warsaw', 'Kraków', 'Wrocław'],
  rs: ['Belgrade', 'Novi Sad'],
  ge: ['Tbilisi', 'Batumi'],
  am: ['Yerevan', 'Gyumri'],
};

export class MockBackend {
  readonly stats: BackendStats = { started: 0, completed: 0, aborted: 0 };

  constructor(readonly latencyMs = 600) {}

  private async run<T>(signal: AbortSignal, work: () => T, latency = this.latencyMs): Promise<T> {
    this.stats.started++;
    try {
      await delay(latency, signal);
    } catch (e) {
      this.stats.aborted++;
      throw e;
    }
    this.stats.completed++;
    return work();
  }

  readonly asyncValidators: readonly AsyncValidatorSpec[] = [
    {
      name: 'usernameAvailable',
      label: 'Username is available',
      appliesTo: ['string'],
      check: (value, signal) =>
        this.run(signal, () =>
          TAKEN_USERNAMES.includes(String(value).trim().toLowerCase())
            ? `"${value}" is already taken`
            : null,
        ),
    },
    {
      name: 'promoCode',
      label: 'Promo code exists',
      appliesTo: ['string'],
      check: (value, signal) =>
        this.run(signal, () =>
          PROMO_CODES.includes(String(value).trim().toUpperCase()) ? null : 'Unknown promo code',
        ),
    },
  ];

  readonly optionProviders: readonly OptionProviderSpec[] = [
    {
      name: 'countries',
      label: 'Countries',
      load: (_params, signal) => this.run(signal, () => COUNTRIES, this.latencyMs / 2),
    },
    {
      name: 'cities',
      label: 'Cities by country (params = country code)',
      load: (params, signal) =>
        this.run(signal, () =>
          (CITIES[String(params ?? '')] ?? []).map((c) => ({ value: c.toLowerCase(), label: c })),
        ),
    },
  ];

  asyncValidator(name: string): AsyncValidatorSpec | undefined {
    return this.asyncValidators.find((v) => v.name === name);
  }

  optionProvider(name: string): OptionProviderSpec | undefined {
    return this.optionProviders.find((p) => p.name === name);
  }
}

/** Shared instance used by the demo app. */
export const mockBackend = new MockBackend();
