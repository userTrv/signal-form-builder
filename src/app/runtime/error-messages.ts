import { ValidationError } from '@angular/forms/signals';

/** Human-readable text for a Signal Forms validation error (custom `message` wins). */
export function errorMessage(error: ValidationError, valueIsList = false): string {
  if (error.message) return error.message;
  const e = error as ValidationError & Partial<Record<'min' | 'max' | 'minLength' | 'maxLength', number>>;
  switch (error.kind) {
    case 'required':
      return 'This field is required';
    case 'min':
      return `Must be at least ${e.min}`;
    case 'max':
      return `Must be at most ${e.max}`;
    case 'minLength':
      return valueIsList ? `Select at least ${e.minLength}` : `Enter at least ${e.minLength} characters`;
    case 'maxLength':
      return valueIsList ? `Select at most ${e.maxLength}` : `Use at most ${e.maxLength} characters`;
    case 'pattern':
      return 'The format is not valid';
    case 'email':
      return 'Enter a valid email address';
    case 'parse':
      return 'Enter a valid value';
    default:
      return 'This value is not valid';
  }
}
