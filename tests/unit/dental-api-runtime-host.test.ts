import { describe, expect, it } from 'vitest';
import { resolveListenHost } from '../../apps/dental-api/src/runtime-host';

describe('Dental API listen host', () => {
  it('binds local runs to loopback by default', () => {
    expect(resolveListenHost({ NODE_ENV: 'development' })).toBe('127.0.0.1');
    expect(resolveListenHost({})).toBe('127.0.0.1');
  });

  it('opts into LAN binding only when explicitly enabled outside production', () => {
    expect(resolveListenHost({ NODE_ENV: 'development', ENABLE_LAN_DEMO_API: 'true' })).toBe('0.0.0.0');
    expect(resolveListenHost({ NODE_ENV: 'production', ENABLE_LAN_DEMO_API: 'true' })).toBe('127.0.0.1');
    expect(resolveListenHost({ NODE_ENV: 'development', ENABLE_LAN_DEMO_API: '1' })).toBe('127.0.0.1');
  });

  it('leaves Vercel host binding platform-managed even when LAN opt-in is set', () => {
    expect(resolveListenHost({ VERCEL: '1', NODE_ENV: 'development', ENABLE_LAN_DEMO_API: 'true' })).toBeUndefined();
  });
});
