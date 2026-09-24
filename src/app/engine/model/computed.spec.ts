import { EVENT_REGISTRATION, INSURANCE_QUOTE } from '../../examples';
import { FormSchema } from '../schema/types';
import { initialValue } from '../schema/walk';
import { applyComputed, evaluateAt, scopeChainAt } from './computed';

const now = () => new Date('2026-09-24T00:00:00Z');

describe('computed fields (pure)', () => {
  const schema: FormSchema = {
    id: 'order',
    title: 'Order',
    fields: [
      {
        type: 'repeat',
        key: 'items',
        label: 'Items',
        fields: [
          { type: 'number', key: 'qty', label: 'Qty' },
          { type: 'number', key: 'price', label: 'Price' },
          { type: 'number', key: 'line', label: 'Line', computed: 'qty * price' },
        ],
      },
      { type: 'number', key: 'total', label: 'Total', computed: 'sum(items.line)' },
      { type: 'number', key: 'vat', label: 'VAT', computed: 'round(total * 0.2, 2)' },
      { type: 'text', key: 'summary', label: 'Summary', computed: "len(items) + ' item(s)'" },
    ],
  };

  it('computes per-row values, aggregates and chained computed fields', () => {
    const value = { items: [{ qty: 2, price: 3.5, line: null }, { qty: 1, price: 10, line: null }], total: null, vat: null, summary: '' };
    expect(applyComputed(schema, value)).toEqual({
      items: [
        { qty: 2, price: 3.5, line: 7 },
        { qty: 1, price: 10, line: 10 },
      ],
      total: 17,
      vat: 3.4,
      summary: '2 item(s)',
    });
  });

  it('returns the same object when nothing changes (so the form effect settles)', () => {
    const once = applyComputed(schema, initialValue(schema));
    expect(applyComputed(schema, once)).toBe(once);
  });

  it('copies only the changed branches and keeps untouched rows by reference', () => {
    const settled = applyComputed(schema, {
      items: [{ qty: 1, price: 1, line: 1 }, { qty: 2, price: 2, line: 4 }],
      total: 5,
      vat: 1,
      summary: '2 item(s)',
    });
    const edited = { ...settled, items: [{ ...(settled['items'] as object[])[0], qty: 5 }, (settled['items'] as object[])[1]] };
    const next = applyComputed(schema, edited);
    expect((next['items'] as object[])[1]).toBe((edited['items'] as object[])[1]);
    expect(next['total']).toBe(9);
  });

  it('keeps symbol-keyed properties (Signal Forms row identity) when copying rows', () => {
    const id = Symbol('row');
    const row = { qty: 3, price: 2, line: null, [id]: 'tracked' };
    const next = applyComputed(schema, { items: [row], total: null, vat: null, summary: '' });
    expect((next['items'] as Record<symbol, unknown>[])[0][id]).toBe('tracked');
  });

  it('runs the insurance example end to end', () => {
    const value = initialValue(INSURANCE_QUOTE);
    Object.assign(value, {
      driver: { birthDate: '2004-03-10', licenseYears: 1 },
      vehicle: { make: 'vw', year: 2020, value: 18000 },
      coverage: 'full',
      deductible: '500',
      extras: ['rental'],
    });
    const out = applyComputed(INSURANCE_QUOTE, value, undefined, { now });
    expect(out).toMatchObject({ driverAge: 22, riskFactor: 1.6, premium: 1281 });
  });

  it('evaluates expressions in the lexical scope of a row', () => {
    const value = initialValue(EVENT_REGISTRATION);
    (value['attendees'] as Record<string, unknown>[])[0]['ticket'] = 'student';
    expect(scopeChainAt(EVENT_REGISTRATION, value, ['attendees', '0', 'studentId'])).toHaveLength(2);
    expect(evaluateAt(EVENT_REGISTRATION, value, ['attendees', '0', 'studentId'], "ticket == 'student'")).toBe(true);
    expect(evaluateAt(EVENT_REGISTRATION, value, ['promo'], 'len(attendees)')).toBe(1);
  });
});
