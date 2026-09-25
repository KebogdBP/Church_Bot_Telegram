import { describe, expect, it } from 'vitest';
import { registrationCapacityIssue } from '../src/registrations/registration-service.js';
import { FieldEncryption } from '../src/security/field-encryption.js';

describe('registration capacity', () => {
  it('allows a place only when both the event and city have capacity', () => {
    expect(registrationCapacityIssue({ total: 59, totalLimit: 60, cityTotal: 9, cityQuota: 10 })).toBeNull();
    expect(registrationCapacityIssue({ total: 60, totalLimit: 60, cityTotal: 1, cityQuota: 10 })).toBe('full');
    expect(registrationCapacityIssue({ total: 20, totalLimit: 60, cityTotal: 10, cityQuota: 10 })).toBe('city_full');
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
