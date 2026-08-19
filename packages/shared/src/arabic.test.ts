import { arabicCount, isolateLtr, OPEN_VIOLATION_FORMS, VIOLATION_FORMS } from './arabic';

/** Strips the invisible bidi isolates so assertions stay readable. */
const plain = (s: string) => s.replace(/[⁦⁩]/g, '');

describe('arabicCount', () => {
  it('uses the dedicated zero, singular and dual forms without a numeral', () => {
    expect(arabicCount(0, VIOLATION_FORMS)).toBe('بلا مخالفات');
    expect(arabicCount(1, VIOLATION_FORMS)).toBe('مخالفة واحدة');
    expect(arabicCount(2, VIOLATION_FORMS)).toBe('مخالفتان');
  });

  it('uses the plural noun for 3-10 and the singular noun from 11 up', () => {
    expect(plain(arabicCount(3, VIOLATION_FORMS))).toBe('3 مخالفات');
    expect(plain(arabicCount(10, VIOLATION_FORMS))).toBe('10 مخالفات');
    expect(plain(arabicCount(11, VIOLATION_FORMS))).toBe('11 مخالفة');
    expect(plain(arabicCount(42, VIOLATION_FORMS))).toBe('42 مخالفة');
  });

  it('isolates the numeral so it cannot be reordered by surrounding Arabic', () => {
    expect(arabicCount(5, VIOLATION_FORMS)).toBe(`${isolateLtr('5')} مخالفات`);
  });

  it('agrees the adjective with the noun in the open-violation forms', () => {
    expect(arabicCount(1, OPEN_VIOLATION_FORMS)).toBe('مخالفة واحدة مفتوحة');
    expect(arabicCount(2, OPEN_VIOLATION_FORMS)).toBe('مخالفتان مفتوحتان');
    expect(plain(arabicCount(5, OPEN_VIOLATION_FORMS))).toBe('5 مخالفات مفتوحة');
  });
});
