import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../../apps/clinic-os/lib/api-base-url';

describe('Clinic OS API base URL', () => {
  it('uses an explicit configured URL when present', () => {
    expect(resolveApiBaseUrl(' https://api.example.test/ ', '192.168.1.50')).toBe('https://api.example.test');
  });

  it('uses the current browser hostname for an unconfigured local API', () => {
    expect(resolveApiBaseUrl(undefined, '192.168.1.50')).toBe('http://192.168.1.50:4300');
    expect(resolveApiBaseUrl('  ', 'localhost')).toBe('http://localhost:4300');
  });
});
