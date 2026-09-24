import { defineSchema } from '../engine';

export const INSURANCE_QUOTE = defineSchema({
  $schema: 'sfb/v1',
  id: 'insuranceQuote',
  title: 'Car insurance quote',
  description: 'Computed fields chained together: driver age → risk factor → premium, recalculated as you type.',
  submitLabel: 'Get my quote',
  fields: [
    {
      type: 'group',
      key: 'driver',
      label: 'Driver',
      fields: [
        {
          type: 'date',
          key: 'birthDate',
          label: 'Date of birth',
          width: 'half',
          rules: { required: true, validators: [{ name: 'minAge', args: { years: 18 } }] },
        },
        { type: 'number', key: 'licenseYears', label: 'Years with a licence', width: 'half', rules: { required: true, min: 0, max: 70 } },
      ],
      checks: [
        {
          assert: 'licenseYears <= age(birthDate) - 16',
          when: '!empty(birthDate) && licenseYears != null',
          target: 'licenseYears',
          message: 'That is more years than your age allows (licence from 16)',
        },
      ],
    },
    {
      type: 'group',
      key: 'vehicle',
      label: 'Vehicle',
      fields: [
        {
          type: 'select',
          key: 'make',
          label: 'Make',
          width: 'half',
          options: [
            { value: 'vw', label: 'Volkswagen' },
            { value: 'toyota', label: 'Toyota' },
            { value: 'bmw', label: 'BMW' },
            { value: 'tesla', label: 'Tesla' },
            { value: 'other', label: 'Other' },
          ],
          rules: { required: true },
        },
        { type: 'number', key: 'year', label: 'Year of manufacture', width: 'half', rules: { required: true, min: 1990, max: 2026 } },
        { type: 'number', key: 'value', label: 'Current value', prefix: '€', step: 500, rules: { required: true, min: 1000, max: 250000 } },
      ],
    },
    {
      type: 'radio',
      key: 'coverage',
      label: 'Coverage',
      options: [
        { value: 'liability', label: 'Liability only' },
        { value: 'partial', label: 'Partial cover' },
        { value: 'full', label: 'Full cover' },
      ],
      rules: { required: true },
    },
    {
      type: 'select',
      key: 'deductible',
      label: 'Deductible',
      visibleWhen: "coverage == 'partial' || coverage == 'full'",
      options: [
        { value: '0', label: 'None' },
        { value: '500', label: '€500 (−€60)' },
        { value: '1000', label: '€1000 (−€120)' },
      ],
      rules: { required: true },
    },
    {
      type: 'multiselect',
      key: 'extras',
      label: 'Extras (€45 each)',
      options: [
        { value: 'roadside', label: 'Roadside assistance' },
        { value: 'rental', label: 'Rental car' },
        { value: 'glass', label: 'Glass cover' },
      ],
    },
    { type: 'date', key: 'startDate', label: 'Policy start', rules: { required: true, validators: [{ name: 'futureDate' }] } },
    { type: 'number', key: 'driverAge', label: 'Driver age', width: 'half', computed: 'age(driver.birthDate)' },
    {
      type: 'number',
      key: 'riskFactor',
      label: 'Risk factor',
      width: 'half',
      computed: 'driverAge == null ? null : driverAge < 25 ? 1.6 : driver.licenseYears < 3 ? 1.3 : 1',
    },
    {
      type: 'number',
      key: 'premium',
      label: 'Yearly premium',
      prefix: '€',
      hint: 'value × rate(coverage) × risk − deductible discount + extras',
      computed:
        "round(vehicle.value * (coverage == 'full' ? 0.045 : coverage == 'partial' ? 0.03 : 0.018) * riskFactor - (deductible == '1000' ? 120 : deductible == '500' ? 60 : 0) + len(extras) * 45, 2)",
    },
  ],
});
