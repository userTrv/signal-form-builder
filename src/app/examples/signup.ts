import { defineSchema } from '../engine';

export const SIGNUP = defineSchema({
  $schema: 'sfb/v1',
  id: 'signup',
  title: 'Create an account',
  description: 'Async username check, password confirmation and a field that only appears for the Team plan.',
  submitLabel: 'Create account',
  fields: [
    {
      type: 'text',
      key: 'username',
      label: 'Username',
      hint: 'Try "admin" or "angular" — they are taken (checked asynchronously).',
      rules: {
        required: true,
        minLength: 3,
        maxLength: 20,
        validators: [{ name: 'slug' }],
        async: [{ name: 'usernameAvailable', debounceMs: 400 }],
      },
    },
    { type: 'email', key: 'email', label: 'Email', rules: { required: true } },
    {
      type: 'text',
      key: 'password',
      label: 'Password',
      secret: true,
      width: 'half',
      rules: { required: true, validators: [{ name: 'strongPassword' }] },
    },
    { type: 'text', key: 'confirmPassword', label: 'Confirm password', secret: true, width: 'half', rules: { required: true } },
    {
      type: 'radio',
      key: 'plan',
      label: 'Plan',
      default: 'free',
      options: [
        { value: 'free', label: 'Free' },
        { value: 'pro', label: 'Pro' },
        { value: 'team', label: 'Team' },
      ],
      rules: { required: true },
    },
    {
      type: 'number',
      key: 'seats',
      label: 'Seats',
      hint: 'Only for the Team plan.',
      visibleWhen: "plan == 'team'",
      rules: { required: true, min: 2, max: 50 },
    },
    { type: 'switch', key: 'newsletter', label: 'Send me product updates' },
    { type: 'checkbox', key: 'terms', label: 'I accept the terms of service', rules: { required: true } },
  ],
  checks: [{ assert: 'confirmPassword == password', target: 'confirmPassword', message: 'Passwords do not match' }],
});
