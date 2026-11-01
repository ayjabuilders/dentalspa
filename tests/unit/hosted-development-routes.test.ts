import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { proxy as clinicProxy, config as clinicConfig } from '../../apps/clinic-os/proxy';
import { proxy as bookingProxy, config as bookingConfig } from '../../apps/public-booking/proxy';

const require = createRequire(resolve('apps/clinic-os/package.json'));
const { unstable_doesMiddlewareMatch: unstable_doesProxyMatch } = require('next/experimental/testing/server');
afterEach(() => vi.unstubAllEnvs());

describe('development-only routes', () => {
  it.each([clinicProxy, bookingProxy])('returns a non-cacheable 404 on hosted deployments', async proxy => {
    vi.stubEnv('VERCEL', '1');
    const response = proxy();
    expect(response?.status).toBe(404);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(await response?.text()).not.toContain('snapshot');
  });
  it.each([clinicProxy, bookingProxy])('preserves local development access', proxy => {
    vi.stubEnv('VERCEL', '');
    expect(proxy()).toBeUndefined();
  });
  it.each(['/design-lab/patients/mobile', '/design-lab/system', '/build', '/build/', '/api/build-status', '/playbook'])('matches internal route %s using the Next matcher', url => {
    expect(unstable_doesProxyMatch({ config: clinicConfig, nextConfig: {}, url })).toBe(true);
  });
  it.each(['/', '/connection?view=patients', '/api/clinic-session', '/patients/20000000-0000-4000-8000-000000000001', '/_next/static/app.js', '/assets/logo.svg'])('leaves application route %s alone', url => {
    expect(unstable_doesProxyMatch({ config: clinicConfig, nextConfig: {}, url })).toBe(false);
  });
  it('blocks only the public booking preview, not the actual booking page', () => {
    expect(unstable_doesProxyMatch({ config: bookingConfig, nextConfig: {}, url: '/preview' })).toBe(true);
    expect(unstable_doesProxyMatch({ config: bookingConfig, nextConfig: {}, url: '/' })).toBe(false);
  });
});
