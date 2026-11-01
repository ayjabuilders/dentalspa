import { describe, expect, it, vi } from 'vitest';
import { verifyAnonymousSurface } from '../../apps/dental-api/scripts/verify-hosted-public-checks.mjs';

const response = (body, status = 200) => ({ status, json: async () => body });
const tables = ['clinic_memberships', 'clinics', 'inquiries', 'patient_account_links', 'patients', 'profiles'];

describe('hosted public preflight', () => {
  it('checks Auth settings and denies anonymous table and roster RPC access', async () => {
    const request = vi.fn(async path => {
      if (path === '/auth/v1/settings') return response({ external: { email: true }, mailer_autoconfirm: false });
      if (path === '/rest/v1/rpc/team_roster') return response({ code: '42501' }, 401);
      return response({ code: '42501' }, 401);
    });

    const checks = await verifyAnonymousSurface(request);
    expect(checks).toHaveLength(10);
    expect(checks.every(check => check.passed)).toBe(true);
    expect(request).toHaveBeenCalledTimes(8);
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    expect(request.mock.calls.find(([, options]) => options?.method === 'POST')?.[0]).toBe('/rest/v1/rpc/team_roster');
    for (const table of tables) expect(request).toHaveBeenCalledWith(`/rest/v1/${table}?select=*&limit=1`);
  });

  it('fails when Auth is unavailable or its expected confirmation settings change', async () => {
    const request = vi.fn(async path => path === '/auth/v1/settings'
      ? response({ external: { email: false }, mailer_autoconfirm: true })
      : response({ code: '42501' }, 401));

    const checks = await verifyAnonymousSurface(request);
    expect(checks[0]?.passed).toBe(true);
    expect(checks[1]?.passed).toBe(false);
    expect(checks[2]?.passed).toBe(false);
  });

  it('fails closed when anonymous table or RPC access is unexpectedly granted', async () => {
    const request = vi.fn(async path => {
      if (path === '/auth/v1/settings') return response({ external: { email: true }, mailer_autoconfirm: false });
      return response([{ id: 'synthetic-only' }], 200);
    });

    const checks = await verifyAnonymousSurface(request);
    expect(checks.filter(check => !check.passed).map(check => check.label)).toEqual([
      ...tables.map(table => `anonymous ${table} read denied`),
      'anonymous team_roster RPC denied',
    ]);
  });
});
