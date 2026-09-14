import { describe, expect, it } from 'vitest';
import { configureOutboundProxy } from '../src/network/outbound-proxy.js';

describe('outbound proxy', () => {
  it('allows no proxy and rejects non-HTTP proxy URLs', () => {
    expect(() => configureOutboundProxy(undefined)).not.toThrow();
    expect(() => configureOutboundProxy('socks5://127.0.0.1:1080')).toThrow('http or https');
  });
});
