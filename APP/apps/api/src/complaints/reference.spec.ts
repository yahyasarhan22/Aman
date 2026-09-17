import { generateReference, isValidReference, normalizeReference } from './reference';
import { decryptContact, encryptContact, hashIp } from './contact';

describe('generateReference', () => {
  it('produces a four-digit code a citizen can read over the phone', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReference()).toMatch(/^[0-9]{4}$/);
    }
  });

  it('never starts with zero, so nothing is lost when it is retyped', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReference().startsWith('0')).toBe(false);
    }
  });

  it('spreads across the range rather than clustering', () => {
    const seen = new Set(Array.from({ length: 400 }, () => generateReference()));
    expect(seen.size).toBeGreaterThan(300);
  });
});

describe('isValidReference', () => {
  it('accepts a bare four-digit code', () => {
    expect(isValidReference('4821')).toBe(true);
  });

  it('accepts the hash-prefixed form citizens copy off the success screen', () => {
    expect(isValidReference('#4821')).toBe(true);
    expect(normalizeReference('#4821')).toBe('4821');
  });

  it('rejects anything else without hitting the database', () => {
    expect(isValidReference('48211')).toBe(false);
    expect(isValidReference('abcd')).toBe(false);
    expect(isValidReference("' OR 1=1 --")).toBe(false);
    expect(isValidReference('')).toBe(false);
  });
});

describe('contact encryption', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

  it('round-trips a phone number', () => {
    const stored = encryptContact('0599123456');
    expect(decryptContact(stored)).toBe('0599123456');
  });

  it('never leaves the number readable in the stored value', () => {
    expect(encryptContact('0599123456')).not.toContain('0599123456');
  });

  it('produces a different ciphertext each time, so equal numbers are not linkable', () => {
    expect(encryptContact('0599123456')).not.toBe(encryptContact('0599123456'));
  });

  it('returns null for a tampered value rather than throwing', () => {
    const stored = encryptContact('0599123456');
    const tampered = stored.slice(0, -2) + 'ff';
    expect(decryptContact(tampered)).toBeNull();
    expect(decryptContact('nonsense')).toBeNull();
  });
});

describe('hashIp', () => {
  it('is deterministic, so rate limiting can count', () => {
    expect(hashIp('10.0.0.1')).toBe(hashIp('10.0.0.1'));
  });

  it('does not reveal the address it came from', () => {
    const hash = hashIp('10.0.0.1');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('10.0.0.1');
  });

  it('separates different addresses', () => {
    expect(hashIp('10.0.0.1')).not.toBe(hashIp('10.0.0.2'));
  });
});
