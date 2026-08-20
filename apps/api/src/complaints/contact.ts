import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function key(): Buffer {
  const secret = process.env.CONTACT_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CONTACT_ENCRYPTION_KEY is not set — refusing to store contact details');
  }
  // A fixed salt keeps the derived key stable across restarts; the secret is
  // what must stay secret.
  return scryptSync(secret, 'aman.contact.v1', 32);
}

/**
 * Spec §7.1 and §11: the complainant's phone is encrypted at rest and visible
 * to admins only. Returns `iv:tag:ciphertext`, all hex.
 */
export function encryptContact(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(
    ':',
  );
}

export function decryptContact(stored: string): string | null {
  const [ivHex, tagHex, dataHex] = stored.split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // A failed auth tag means the row was tampered with or the key rotated.
    // Returning null beats throwing: an admin screen should still render.
    return null;
  }
}

/**
 * Spec §11: never store a raw IP. The hash exists only to enforce rate limits,
 * so it is salted with the same secret and is not reversible to an address.
 */
export function hashIp(ip: string): string {
  const secret = process.env.CONTACT_ENCRYPTION_KEY ?? 'aman-dev-salt';
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex');
}
