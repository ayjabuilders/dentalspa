import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseIdentity } from '../../apps/dental-api/src/identity/infrastructure/supabase';
import { A, B, STAFF, P1 } from '../fixtures';

// Exercise the real Supabase SDK and adapter. Only its HTTP transport is faked;
// these checks are not evidence of hosted Supabase/RLS configuration.
describe('Supabase identity adapter HTTP boundary', () => {
  const providerUrl = 'https://synthetic-identity.example.test';
  const publicKey = 'synthetic-public-key';
  const token = 'synthetic-user-access-token';
  let requests: { url: URL; headers: Headers }[];
  let response: unknown;
  let status: number;
  let queuedResponses: unknown[] | null;

  beforeEach(() => {
    requests = [];
    response = [];
    status = 200;
    queuedResponses = null;
    vi.stubEnv('SUPABASE_URL', providerUrl);
    vi.stubEnv('SUPABASE_ANON_KEY', publicKey);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      requests.push({ url, headers: request.headers });
      const body = queuedResponses ? queuedResponses.shift() : response;
      return new Response(JSON.stringify(body ?? response), { status, headers: { 'Content-Type': 'application/json' } });
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('verifies the bearer against Auth instead of accepting caller claims', async () => {
    queuedResponses = [{ id: STAFF, aud: 'authenticated', user_metadata: { role: 'manager', clinic_id: A } }, true];
    expect(await new SupabaseIdentity().verify(token)).toBe(STAFF);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.url.pathname).toBe('/rest/v1/rpc/is_current_session_active');
    expect(requests[1]!.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(requests[0]!.url.pathname).toBe('/auth/v1/user');
    expect(requests[0]!.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(requests[0]!.headers.get('apikey')).toBe(publicKey);
    expect(requests[0]!.url.search).toBe('');
  });

  it('rejects an expired or revoked provider token', async () => {
    status = 401; response = { message: 'JWT expired', code: 'bad_jwt' };
    expect(await new SupabaseIdentity().verify(token)).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it('rejects a still-valid Auth token after its session is revoked', async () => {
    queuedResponses = [{ id: STAFF, aud: 'authenticated' }, false];
    expect(await new SupabaseIdentity().verify(token)).toBeNull();
    expect(requests).toHaveLength(2);
  });

  it.each([null, 'true', { active: true }, []])('fails closed on malformed session evidence', async evidence => {
    queuedResponses = [{ id: STAFF, aud: 'authenticated' }, evidence];
    await expect(new SupabaseIdentity().verify(token)).rejects.toThrow('Session verification unavailable');
  });

  it('scopes membership reads by verified user and active state while preserving the user bearer', async () => {
    response = [{ clinic_id: A, user_id: STAFF, role: 'reception', active: true }];
    expect(await new SupabaseIdentity().memberships(token, STAFF)).toEqual(response);
    const request = requests[0]!;
    expect(request.url.pathname).toBe('/rest/v1/clinic_memberships');
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${STAFF}`);
    expect(request.url.searchParams.get('active')).toBe('eq.true');
    expect(request.url.searchParams.get('select')).toBe('clinic_id,user_id,role,active');
    expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(request.headers.get('apikey')).toBe(publicKey);
  });

  it('requests only verified links belonging to the authenticated account', async () => {
    response = [{ clinic_id: A, user_id: STAFF, patient_id: P1, verified_at: '2026-10-26T10:00:00Z' }];
    expect(await new SupabaseIdentity().patientLinks(token, STAFF)).toEqual(response);
    const request = requests[0]!;
    expect(request.url.pathname).toBe('/rest/v1/patient_account_links');
    expect(request.url.searchParams.get('user_id')).toBe(`eq.${STAFF}`);
    expect(request.url.searchParams.get('verified_at')).toBe('not.is.null');
    expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
  });

  it('returns minimal workspace choices from the user-scoped active memberships and clinic names', async () => {
    queuedResponses = [[
      { clinic_id: A, user_id: STAFF, role: 'manager', active: true },
      { clinic_id: A, user_id: STAFF, role: 'reception', active: true },
      { clinic_id: B, user_id: STAFF, role: 'dentist', active: true },
    ], [{ id: A, name: 'Cabinet A' }, { id: B, name: 'Cabinet B' }]];
    expect(await new SupabaseIdentity().workspaces(token, STAFF)).toEqual({ items: [
      { clinic_id: A, clinic_name: 'Cabinet A', roles: ['manager', 'reception'] },
      { clinic_id: B, clinic_name: 'Cabinet B', roles: ['dentist'] },
    ] });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url.pathname).toBe('/rest/v1/clinic_memberships');
    expect(requests[0]!.url.searchParams.get('user_id')).toBe(`eq.${STAFF}`);
    expect(requests[0]!.url.searchParams.get('active')).toBe('eq.true');
    expect(requests[0]!.url.searchParams.get('select')).toBe('clinic_id,user_id,role,active');
    expect(requests[1]!.url.pathname).toBe('/rest/v1/clinics');
    expect(requests[1]!.url.searchParams.get('select')).toBe('id,name');
    expect(requests.every(request => request.headers.get('authorization') === `Bearer ${token}`)).toBe(true);
    expect(requests.every(request => request.headers.get('apikey') === publicKey)).toBe(true);
  });

  it('returns an empty choice list without querying clinic names when there are no memberships', async () => {
    queuedResponses = [[]];
    expect(await new SupabaseIdentity().workspaces(token, STAFF)).toEqual({ items: [] });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.pathname).toBe('/rest/v1/clinic_memberships');
  });

  it('fails closed on malformed membership rows or missing authorized clinic names', async () => {
    queuedResponses = [[{ clinic_id: A, user_id: STAFF, role: 'owner', active: true }]];
    await expect(new SupabaseIdentity().workspaces(token, STAFF)).rejects.toThrow('Clinic workspace lookup unavailable');
    expect(requests).toHaveLength(1);
    requests = [];
    queuedResponses = [[{ clinic_id: A, user_id: STAFF, role: 'dentist', active: true }], []];
    await expect(new SupabaseIdentity().workspaces(token, STAFF)).rejects.toThrow('Clinic workspace lookup unavailable');
    expect(requests).toHaveLength(2);
  });

  it('fails explicitly when the verified account has more than 100 active clinic choices', async () => {
    queuedResponses = [Array.from({ length: 101 }, (_, index) => ({
      clinic_id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      user_id: STAFF,
      role: 'dentist',
      active: true,
    }))];
    await expect(new SupabaseIdentity().workspaces(token, STAFF)).rejects.toThrow('Clinic workspace lookup unavailable');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.searchParams.get('limit')).toBe('401');
  });

  it('fails closed with a sanitized error when membership or linkage lookup fails', async () => {
    status = 403; response = { message: 'sensitive provider diagnostic', details: 'synthetic record details', code: '42501' };
    const identity = new SupabaseIdentity();
    await expect(identity.memberships(token, STAFF)).rejects.toThrow('Membership lookup unavailable');
    await expect(identity.patientLinks(token, STAFF)).rejects.toThrow('Account verification unavailable');
  });

  it('does not inherit another request token in a subsequent scoped client', async () => {
    const identity = new SupabaseIdentity();
    await identity.memberships('first-synthetic-token', STAFF);
    await identity.memberships('second-synthetic-token', STAFF);
    expect(requests.map(request => request.headers.get('authorization'))).toEqual(['Bearer first-synthetic-token', 'Bearer second-synthetic-token']);
  });

  it('does not make any network request when provider configuration is missing', async () => {
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    await expect(new SupabaseIdentity().verify(token)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(requests).toHaveLength(0);
  });
});
