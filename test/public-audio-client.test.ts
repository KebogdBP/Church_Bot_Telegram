import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from '../src/sermons/public-audio-client.js';

describe('public audio network policy', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])('blocks private address %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])('allows public address %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});
