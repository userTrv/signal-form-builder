import { EXAMPLES, stressSchema } from '../../examples';
import { MockBackend } from '../model/mock-backend';
import { FieldKindRegistry } from './field-kinds';
import { validateSchema } from './validate-schema';

const messages = (input: unknown) => validateSchema(input).issues.map((i) => `${i.path}: ${i.message}`);

const form = (fields: unknown[], extra: Record<string, unknown> = {}) => ({ id: 'f', title: 'F', fields, ...extra });

describe('validateSchema', () => {
  it.each(EXAMPLES.map((e) => [e.id, e.schema] as const))('accepts the %s example without issues', (_id, schema) => {
    const result = validateSchema(schema);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts the generated stress schema', () => {
    expect(validateSchema(stressSchema(300, 50)).ok).toBe(true);
  });

  it('rejects non-objects and missing structure (stage = structure)', () => {
    const r = validateSchema([]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.stage).toBe('structure');
    expect(messages({ id: 'x', title: 'X', fields: 3 })).toEqual(['fields: "fields" must be an array']);
    expect(messages(form([{ type: 'nope', key: 'a', label: 'A' }]))).toEqual(['fields[0].type: Unknown field type "nope"']);
    expect(messages(form([{ type: 'group', key: 'g', label: 'G' }]))).toEqual(['fields[0].fields: A group needs a "fields" array']);
  });

  it('checks keys, labels and duplicates per scope', () => {
    expect(
      messages(
        form([
          { type: 'text', key: '1bad', label: 'A' },
          { type: 'text', key: 'a', label: '' },
        ]),
      ),
    ).toEqual([
      'fields[0].key: "key" must be an identifier (letters, digits, _) — got "1bad"',
      'fields[1].label: Field needs a "label"',
    ]);
    const dup = messages(
      form([
        { type: 'step', id: 's1', title: 'S1', fields: [{ type: 'text', key: 'a', label: 'A' }] },
        { type: 'step', id: 's2', title: 'S2', fields: [{ type: 'text', key: 'a', label: 'A2' }] },
      ]),
    );
    expect(dup).toEqual(['fields[1].fields[0].key: Duplicate key "a" in this scope (also at fields[0].fields[0])']);
    // same key in different scopes is fine
    expect(
      messages(form([{ type: 'text', key: 'a', label: 'A' }, { type: 'group', key: 'g', label: 'G', fields: [{ type: 'text', key: 'a', label: 'A' }] }])),
    ).toEqual([]);
  });

  it('enforces wizard structure', () => {
    expect(messages(form([{ type: 'step', id: 's', title: 'S', fields: [] }, { type: 'text', key: 'a', label: 'A' }]))).toContain(
      'fields: Either every top-level node is a step (wizard) or none is',
    );
    expect(
      messages(form([{ type: 'group', key: 'g', label: 'G', fields: [{ type: 'step', id: 's', title: 'S', fields: [] }] }])),
    ).toContain('fields[0].fields[0]: Steps are only allowed at the top level');
  });

  it('validates expressions: syntax, unknown fields and paths', () => {
    const r = messages(
      form([
        { type: 'text', key: 'a', label: 'A', visibleWhen: 'b = 1' },
        { type: 'text', key: 'b', label: 'B', enabledWhen: 'missing > 1' },
        { type: 'group', key: 'g', label: 'G', fields: [{ type: 'text', key: 'x', label: 'X' }] },
        { type: 'text', key: 'c', label: 'C', visibleWhen: 'g.y == 1' },
        { type: 'text', key: 'd', label: 'D', visibleWhen: 'a.z == 1' },
      ]),
    );
    expect(r).toEqual([
      'fields[0].visibleWhen: Unexpected character "=" — use "==" to compare (at 3)',
      'fields[1].enabledWhen: Unknown field "missing"',
      'fields[3].visibleWhen: "g" has no field "y"',
      'fields[4].visibleWhen: "a" is a text field and has no "z"',
    ]);
  });

  it('resolves row-level references inside repeats and rejects them outside', () => {
    const rows = {
      type: 'repeat',
      key: 'rows',
      label: 'Rows',
      fields: [
        { type: 'number', key: 'qty', label: 'Q' },
        { type: 'number', key: 'total', label: 'T', computed: 'qty * 2' },
      ],
    };
    expect(messages(form([rows, { type: 'number', key: 'sum', label: 'S', computed: 'sum(rows.total)' }]))).toEqual([]);
    expect(messages(form([rows, { type: 'number', key: 'bad', label: 'B', computed: 'qty' }]))).toEqual([
      'fields[1].computed: Unknown field "qty"',
    ]);
  });

  it('detects computed-field cycles', () => {
    const r = messages(
      form([
        { type: 'number', key: 'a', label: 'A', computed: 'b + 1' },
        { type: 'number', key: 'b', label: 'B', computed: 'a + 1' },
      ]),
    );
    expect(r).toEqual(['fields: Computed fields form a cycle: a → b → a']);
    expect(messages(form([{ type: 'number', key: 'a', label: 'A', computed: 'a + 1' }]))).toEqual([
      'fields: Computed fields form a cycle: a → a',
    ]);
  });

  it('checks rules, options, validators and cross-field targets', () => {
    const r = messages(
      form(
        [
          { type: 'number', key: 'n', label: 'N', rules: { min: 5, max: 1 } },
          { type: 'text', key: 't', label: 'T', rules: { pattern: { regex: '([' }, validators: [{ name: 'nope' }], async: [{ name: 'x' }] } },
          { type: 'select', key: 's', label: 'S', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }] },
          { type: 'radio', key: 'r', label: 'R' },
          { type: 'checkbox', key: 'c', label: 'C', rules: { validators: [{ name: 'strongPassword' }] } },
          { type: 'switch', key: 'w', label: 'W', computed: '1' },
        ],
        { checks: [{ assert: 'n > 0', target: 'zzz', message: 'm' }] },
      ),
    );
    expect(r).toEqual([
      'fields[0].rules.min: min is greater than max',
      'fields[1].rules.pattern.regex: Invalid regular expression "(["',
      'fields[1].rules.validators[0]: Unknown validator "nope"',
      'fields[1].rules.async[0]: Unknown async validator "x"',
      'fields[2].options[1].value: Duplicate option value "a"',
      'fields[3].options: A radio needs "options" or "optionsSource"',
      'fields[4].rules.validators[0]: "strongPassword" does not apply to checkbox fields',
      'fields[5].computed: switch fields cannot be computed',
      'checks[0].target: Unknown target "zzz"',
    ]);
  });

  it('reports inapplicable built-in rules as warnings, not errors', () => {
    const r = validateSchema(form([{ type: 'checkbox', key: 'c', label: 'C', rules: { minLength: 2 } }]));
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([
      { severity: 'warning', path: 'fields[0].rules.minLength', nodePath: [0], message: '"minLength" does not apply to checkbox fields' },
    ]);
  });

  it('knows custom field types only when registered', () => {
    const input = form([{ type: 'color', key: 'c', label: 'C' }]);
    expect(validateSchema(input).ok).toBe(false);
    const kinds = new FieldKindRegistry().register({ type: 'color', label: 'Color', icon: '■', valueKind: 'string', rules: ['required'] });
    expect(validateSchema(input, { kinds, backend: new MockBackend() }).ok).toBe(true);
  });
});
