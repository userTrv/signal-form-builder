import { EXAMPLES, SIGNUP } from '../../examples';
import { FieldKindRegistry } from '../schema/field-kinds';
import { FormSchema } from '../schema/types';
import { generateTypeScript, pascalCase } from './generate-ts';

describe('type generation (text)', () => {
  it('emits the draft type of the sign-up schema', () => {
    expect(generateTypeScript(SIGNUP)).toBe(`/**
 * Create an account
 * Generated from schema "signup" — model value while editing.
 */
export interface SignupDraft {
  /**
   * Username
   * Try "admin" or "angular" — they are taken (checked asynchronously).
   */
  username: string;
  /** Email */
  email: string;
  /** Password */
  password: string;
  /** Confirm password */
  confirmPassword: string;
  /** Plan */
  plan: 'free' | 'pro' | 'team' | '';
  /**
   * Seats
   * Only for the Team plan.
   * @visibleWhen \`plan == 'team'\`
   */
  seats: number | null;
  /** Send me product updates */
  newsletter: boolean;
  /** I accept the terms of service */
  terms: boolean;
}
`);
  });

  it('narrows required, unconditional fields in the submitted type', () => {
    const out = generateTypeScript(SIGNUP, { mode: 'submitted' });
    expect(out).toContain('export interface SignupValue {');
    expect(out).toContain("  plan: 'free' | 'pro' | 'team';");
    expect(out).toContain('  seats: number | null;'); // required but conditional → still nullable
    expect(out).toContain('  terms: true;');
  });

  it.each(EXAMPLES.map((e) => [e.id, e.schema] as const))('matches the snapshot for %s', (_id, schema) => {
    expect(generateTypeScript(schema)).toMatchSnapshot();
    expect(generateTypeScript(schema, { mode: 'submitted' })).toMatchSnapshot();
  });

  it('handles nesting, quoting, custom types and comment injection', () => {
    const schema: FormSchema = {
      id: 'weird-form id',
      title: 'Weird */ title',
      fields: [
        { type: 'group', key: 'g', label: 'G', fields: [{ type: 'color', key: 'c', label: 'C' }] },
        { type: 'multiselect', key: 'm', label: 'M', options: [{ value: "it's", label: 'x' }] },
        { type: 'file', key: 'f', label: 'F' },
      ],
    };
    const kinds = new FieldKindRegistry().register({ type: 'color', label: 'Color', icon: '■', valueKind: 'string', rules: [], tsType: '`#${string}`' });
    const out = generateTypeScript(schema, { kinds });
    expect(out).toContain('export interface WeirdFormIdDraft {');
    expect(out).toContain(' * Weird *\\/ title');
    expect(out).toContain('    c: `#${string}`;');
    expect(out).toContain("  m: 'it\\'s'[];");
    expect(out).toContain('  f: FileMeta[];');
    expect(out).toContain('export interface FileMeta {');
  });

  it('pascalCase', () => {
    expect(pascalCase('jobApplication')).toBe('JobApplication');
    expect(pascalCase('my-form_v2')).toBe('MyFormV2');
    expect(pascalCase('2fa')).toBe('Form2fa');
  });
});
