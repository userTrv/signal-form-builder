import { applyMask, getNamedValidator, isMaskComplete } from './validators';

const now = () => new Date('2026-09-24T10:00:00Z');
const check = (name: string, value: unknown, args = {}) => getNamedValidator(name)!.validate(value, args, now);

describe('named validators', () => {
  it('treat empty values as valid (required is a separate rule)', () => {
    for (const name of ['strongPassword', 'noWhitespace', 'slug', 'businessEmail', 'minAge', 'futureDate', 'pastDate']) {
      expect(check(name, '')).toBeNull();
    }
  });

  it('strongPassword / noWhitespace / slug / businessEmail', () => {
    expect(check('strongPassword', 'short1A')).toContain('8+');
    expect(check('strongPassword', 'Longenough1')).toBeNull();
    expect(check('noWhitespace', 'a b')).toBe('Spaces are not allowed');
    expect(check('slug', 'Bad Slug')).not.toBeNull();
    expect(check('slug', 'good-slug_2')).toBeNull();
    expect(check('businessEmail', 'me@gmail.com')).toBe('Please use a work address');
    expect(check('businessEmail', 'me@acme.io')).toBeNull();
  });

  it('date validators use the injected clock', () => {
    expect(check('minAge', '2008-09-25', { years: 18 })).toBe('You must be at least 18 years old');
    expect(check('minAge', '2008-09-24', { years: 18 })).toBeNull();
    expect(check('futureDate', '2026-09-24')).toBe('Pick a date after today');
    expect(check('futureDate', '2026-09-25')).toBeNull();
    expect(check('pastDate', '2026-09-23')).toBeNull();
  });
});

describe('phone mask', () => {
  const mask = '+1 (###) ###-####';
  it.each([
    ['5', '+1 (5'],
    ['555123', '+1 (555) 123'],
    ['5551234567', '+1 (555) 123-4567'],
    ['15551234567', '+1 (555) 123-4567'],
    ['+1 (555) 123-45679', '+1 (555) 123-4567'],
    ['+1 (5', '+1 (5'],
    ['abc', ''],
  ])('%j → %j', (input, expected) => {
    expect(applyMask(mask, input)).toBe(expected);
  });

  it('is idempotent and detects completeness', () => {
    const once = applyMask(mask, '5551234567');
    expect(applyMask(mask, once)).toBe(once);
    expect(isMaskComplete(mask, once)).toBe(true);
    expect(isMaskComplete(mask, '+1 (555)')).toBe(false);
  });
});
