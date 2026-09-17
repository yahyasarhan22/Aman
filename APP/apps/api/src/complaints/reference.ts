import { randomInt } from 'node:crypto';

/**
 * Spec §5.2 shows references like #4821 — short enough to read aloud, write on
 * a receipt, or retype from memory. Four digits is a small space, so callers
 * must retry on the unique-index collision rather than trusting uniqueness
 * here.
 */
export function generateReference(): string {
  return String(randomInt(1000, 10000));
}

/** Citizens paste the code with or without the hash they saw on screen. */
export function normalizeReference(input: string): string {
  return input.trim().replace(/^#/, '');
}

export function isValidReference(input: string): boolean {
  return /^[0-9]{4}$/.test(normalizeReference(input));
}
