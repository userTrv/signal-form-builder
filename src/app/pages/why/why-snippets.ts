// Code shown on the "Why Signal Forms" page. Both versions implement the same sign-up form:
// async username check, password confirmation, and a "seats" field only for the Team plan.

export const REACTIVE_CODE = `// Typed Reactive Forms (Angular 14+)
@Component({ /* … */ imports: [ReactiveFormsModule] })
export class SignupReactive {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(UserApi);

  readonly form = this.fb.group(
    {
      username: this.fb.control('', {
        validators: [Validators.required, Validators.minLength(3)],
        asyncValidators: [usernameAvailable(this.api)],
      }),
      password: ['', [Validators.required, strongPassword]],
      confirmPassword: ['', Validators.required],
      plan: this.fb.control<'free' | 'pro' | 'team'>('free'),
      seats: this.fb.control<number | null>({ value: null, disabled: true }),
    },
    // the error ends up on the *group*, not on confirmPassword
    { validators: [matchFields('password', 'confirmPassword')] },
  );

  constructor() {
    // conditional field: toggled imperatively on every change
    this.form.controls.plan.valueChanges
      .pipe(startWith(this.form.controls.plan.value), takeUntilDestroyed())
      .subscribe((plan) => {
        const seats = this.form.controls.seats;
        if (plan === 'team') {
          seats.enable({ emitEvent: false });
          seats.setValidators([Validators.required, Validators.min(2)]);
        } else {
          seats.disable({ emitEvent: false });
          seats.clearValidators();
        }
        seats.updateValueAndValidity({ emitEvent: false });
      });
  }

  submit() {
    // value omits disabled controls → getRawValue() for everything
    const value = this.form.getRawValue();
  }
}

function usernameAvailable(api: UserApi): AsyncValidatorFn {
  return (control) =>
    timer(400).pipe( // debounce by hand; switchMap-style cancellation
      switchMap(() => api.isTaken$(control.value)),
      map((taken) => (taken ? { taken: true } : null)),
    );
}`;

export const SIGNALS_CODE = `// Signal Forms (@angular/forms/signals, Angular 22)
interface Signup {
  username: string;
  password: string;
  confirmPassword: string;
  plan: 'free' | 'pro' | 'team';
  seats: number | null;
}

@Component({ /* … */ imports: [FormField] })
export class SignupSignals {
  private readonly api = inject(UserApi);

  // the model is a plain signal — the form wraps it, it does not copy it
  readonly model = signal<Signup>({
    username: '', password: '', confirmPassword: '', plan: 'free', seats: null,
  });

  readonly form = form(this.model, (p) => {
    required(p.username);
    minLength(p.username, 3);
    validateAsync(p.username, {
      params: ({ value }) => value() || undefined,
      debounce: 400,
      factory: (username) =>
        resource({
          params: username,
          loader: ({ params, abortSignal }) => this.api.isTaken(params, abortSignal),
        }),
      onSuccess: (taken) => (taken ? { kind: 'taken', message: 'Username is taken' } : null),
      onError: () => ({ kind: 'unavailable', message: 'Could not check right now' }),
    });

    required(p.password);
    validate(p.password, ({ value }) => strongPassword(value()));

    // cross-field rule, error lands on confirmPassword itself
    validate(p.confirmPassword, ({ value, valueOf }) =>
      value() === valueOf(p.password) ? null : { kind: 'mismatch', message: 'Passwords do not match' });

    // conditional field: declarative, re-evaluated reactively
    hidden(p.seats, { when: ({ valueOf }) => valueOf(p.plan) !== 'team' });
    required(p.seats);
    min(p.seats, 2);
  });

  submit() {
    const value: Signup = this.model(); // already typed, nothing to unwrap
  }
}`;

export const REACTIVE_TEMPLATE = `<form [formGroup]="form" (ngSubmit)="submit()">
  <input formControlName="username" />
  @if (form.controls.username.pending) { Checking… }
  <input type="password" formControlName="password" />
  <input type="password" formControlName="confirmPassword" />
  @if (form.hasError('mismatch')) { Passwords do not match }
  <!-- radios for plan … -->
  @if (form.controls.plan.value === 'team') {
    <input type="number" formControlName="seats" />
  }
</form>`;

export const SIGNALS_TEMPLATE = `<form (submit)="$event.preventDefault(); submit()">
  <input [formField]="form.username" />
  @if (form.username().pending()) { Checking… }
  <input type="password" [formField]="form.password" />
  <input type="password" [formField]="form.confirmPassword" />
  @for (e of form.confirmPassword().errors(); track e) { {{ e.message }} }
  <!-- radios for plan … -->
  @if (!form.seats().hidden()) {
    <input type="number" [formField]="form.seats" />
  }
</form>`;
