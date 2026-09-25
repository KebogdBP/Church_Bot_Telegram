import { describe, expect, it } from 'vitest';
import { numericRangeIssue, registrationCapacityIssue } from '../src/registrations/registration-service.js';
import { FieldEncryption } from '../src/security/field-encryption.js';

describe('registration capacity', () => {
  it('allows a place only when both the event and city have capacity', () => {
    expect(registrationCapacityIssue({ total: 59, totalLimit: 60, cityTotal: 9, cityQuota: 10 })).toBeNull();
    expect(registrationCapacityIssue({ total: 60, totalLimit: 60, cityTotal: 1, cityQuota: 10 })).toBe('full');
    expect(registrationCapacityIssue({ total: 20, totalLimit: 60, cityTotal: 10, cityQuota: 10 })).toBe('city_full');
  });
});

describe('registration numeric limits', () => {
  it('accepts both ends of an inclusive age range', () => {
    expect(numericRangeIssue(20, 20, 40)).toBe(false);
    expect(numericRangeIssue(40, 20, 40)).toBe(false);
  });

  it('rejects values below or above the configured range', () => {
    expect(numericRangeIssue(19, 20, 40)).toBe(true);
    expect(numericRangeIssue(41, 20, 40)).toBe(true);
  });

  it('supports one-sided and disabled limits', () => {
    expect(numericRangeIssue(5, null, null)).toBe(false);
    expect(numericRangeIssue(5, 10, null)).toBe(true);
    expect(numericRangeIssue(50, null, 40)).toBe(true);
  });
});

describe('registration field encryption', () => {
  it('encrypts personal registration data at rest', () => {
    const encryption = new FieldEncryption('a-long-private-registration-secret');
    const encrypted = encryption.encrypt('Иван Иванов');
    expect(encrypted).not.toContain('Иван');
    expect(encryption.decrypt(encrypted)).toBe('Иван Иванов');
  });

  it('does not decrypt data with another application secret', () => {
    const encrypted = new FieldEncryption('first-private-secret').encrypt('42');
    expect(() => new FieldEncryption('second-private-secret').decrypt(encrypted)).toThrow();
  });
});
