import { FormSchema, SchemaNode } from '../engine';

/**
 * A generated schema for the performance page: `fieldCount` top-level fields (a mix of
 * types, every 10th one conditional) plus a repeatable group with `rows` rows, each with a
 * computed line total, and a computed grand total over all rows.
 */
export function stressSchema(fieldCount = 300, rows = 50): FormSchema {
  const fields: SchemaNode[] = [];
  for (let i = 1; i <= fieldCount; i++) {
    const key = `f${i}`;
    const label = `Field ${i}`;
    const common = { key, label, width: 'half' as const };
    switch (i % 5) {
      case 0:
        fields.push({ ...common, type: 'number', rules: { min: 0, max: 1000 } });
        break;
      case 1:
        fields.push({ ...common, type: 'text', rules: { required: i % 3 === 0, maxLength: 40 } });
        break;
      case 2:
        fields.push({
          ...common,
          type: 'select',
          options: [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
          ],
        });
        break;
      case 3:
        fields.push({ ...common, type: 'checkbox' });
        break;
      default:
        fields.push({ ...common, type: 'date' });
    }
    if (i % 10 === 0) {
      fields[fields.length - 1] = { ...fields[fields.length - 1], visibleWhen: `f${i - 7} != true` };
    }
  }
  fields.push({
    type: 'repeat',
    key: 'items',
    label: 'Line items',
    itemLabel: 'Item',
    initialItems: rows,
    maxItems: rows + 50,
    fields: [
      { type: 'text', key: 'sku', label: 'SKU', width: 'half', rules: { required: true } },
      { type: 'number', key: 'qty', label: 'Qty', width: 'half', rules: { min: 0 } },
      { type: 'number', key: 'price', label: 'Price', width: 'half', rules: { min: 0 } },
      { type: 'number', key: 'lineTotal', label: 'Line total', width: 'half', computed: 'qty * price' },
    ],
  });
  fields.push({ type: 'number', key: 'grandTotal', label: 'Grand total', computed: 'sum(items.lineTotal)' });
  return {
    $schema: 'sfb/v1',
    id: 'stress',
    title: `Stress test: ${fieldCount} fields + ${rows} rows`,
    fields,
  };
}
