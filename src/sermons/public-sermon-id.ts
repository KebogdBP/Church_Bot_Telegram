import { randomBytes } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createPublicSermonId(): string {
  return [...randomBytes(6)].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function normalizePublicSermonId(value: string): string {
  return value.trim().toUpperCase();
}
