import { describe, expect, it } from 'vitest';
import { resolveAllowedOrigins } from '../../apps/dental-api/src/runtime-origins';

describe('API browser origin configuration', () => {
  it('preserves local defaults and explicit LAN configuration', () => {
    expect(resolveAllowedOrigins({})).toContain('http://localhost:4204');
    expect(resolveAllowedOrigins({ ALLOWED_ORIGINS: 'http://192.168.11.102:4204' })).toEqual(['http://192.168.11.102:4204']);
  });
  it('accepts distinct exact deployment origins and deduplicates them', () => {
    expect(resolveAllowedOrigins({ VERCEL: '1', ALLOWED_ORIGINS: ' https://clinic.example.com,https://pass.example.com,https://clinic.example.com ' }))
      .toEqual(['https://clinic.example.com', 'https://pass.example.com']);
  });
  it.each([undefined, '', '*', 'https://*.example.com', 'http://clinic.example.com', 'https://localhost', 'https://app.localhost', 'https://app.local', 'https://127.0.0.1', 'https://[::1]', 'https://user:secret@example.com', 'https://clinic.example.com/path', 'https://clinic.example.com?x=1', 'https://clinic.example.com#x'])('rejects unusable hosted configuration %s', value => {
    expect(() => resolveAllowedOrigins({ VERCEL: '1', ALLOWED_ORIGINS: value })).toThrow('ALLOWED_ORIGINS');
  });
});
