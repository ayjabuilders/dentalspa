import { describe, expect, it } from 'vitest';
import { localDemoUrl } from '../../apps/clinic-os/lib/local-demo-url';

describe('local demo URLs', () => {
  it('keeps separate local apps reachable from a private Wi-Fi address', () => {
    expect(localDemoUrl('http://localhost:4205/', '192.168.11.116')).toBe('http://192.168.11.116:4205/');
    expect(localDemoUrl('http://localhost:4202', '10.0.0.12')).toBe('http://10.0.0.12:4202/');
  });

  it('keeps loopback previews local on the development computer', () => {
    expect(localDemoUrl('http://localhost:4205/', 'localhost')).toBe('http://localhost:4205/');
  });

  it('does not expose a localhost preview link on a hosted public site', () => {
    expect(localDemoUrl('http://localhost:4201/', 'dental.example.com')).toBeNull();
  });

  it('does not rewrite ordinary application links', () => {
    expect(localDemoUrl('/planning', '192.168.11.116')).toBe('/planning');
  });
});
