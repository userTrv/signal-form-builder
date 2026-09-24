import { SIGNUP } from '../../examples';
import { makeScope, scopeChainFor } from '../schema/walk';
import { checkExpression } from './check';

describe('checkExpression (builder editor)', () => {
  const scopes = [makeScope(SIGNUP.fields)];

  it('accepts valid expressions and lists what they read', () => {
    expect(checkExpression("plan == 'team' && len(username) > 2", scopes)).toEqual({ ok: true, refs: ['plan', 'username'] });
  });

  it('points at syntax errors and unknown fields', () => {
    expect(checkExpression('plan ==', scopes)).toMatchObject({ ok: false, message: 'Unexpected end of expression', start: 7 });
    expect(checkExpression('seats > 1 && foo', scopes)).toEqual({ ok: false, message: 'Unknown field "foo"', start: 13, end: 16 });
  });

  it('builds scope chains from index paths (inner scope only for checks)', () => {
    const schema = {
      id: 'x',
      title: 'X',
      fields: [{ type: 'group', key: 'g', label: 'G', fields: [{ type: 'text', key: 'inner', label: 'I' }] }],
    } as const;
    expect(scopeChainFor(schema, [0])).toHaveLength(1);
    expect(scopeChainFor(schema, [0], true)).toHaveLength(2);
    expect(checkExpression('inner', scopeChainFor(schema, [0, 0])).ok).toBe(true);
    expect(checkExpression('inner', scopeChainFor(schema, [0])).ok).toBe(false);
  });
});
