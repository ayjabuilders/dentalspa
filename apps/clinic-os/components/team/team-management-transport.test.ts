import { describe, expect, it, vi } from 'vitest';
import { createTeamManagementTransport, sameTeamRoles, validTemporaryTeamPassword } from './team-management-transport';

const clinic = '10000000-0000-4000-8000-000000000001', user = '20000000-0000-4000-8000-000000000001', memberId = '30000000-0000-4000-8000-000000000001', other = '40000000-0000-4000-8000-000000000001';
const clinical_role_notice = 'Clinical roles grant application access only; they do not verify professional qualifications.';
const member = { user_id: memberId, display_name: 'Membre FICTIF', email: 'member@example.test', roles: ['reception'], active: true, version: 1, created_at: '2026-11-01T12:00:00Z' };
const list = { schema_version: 1, clinic_id: clinic, current_user_id: user, items: [member], next_cursor: null, clinical_role_notice };
const create = { display_name: 'Membre FICTIF', email: 'MEMBER@example.test', temporary_password: 'OnlySynthetic!123', roles: ['reception' as const] };
const options = { api: 'http://localhost:4300', token: 'synthetic-token', clinicId: clinic, currentUserId: user, onSessionExpired: vi.fn() };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('team member management transport', () => {
  it('requests literal global search and opaque pagination with no-store renewing headers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(list));
    expect(await createTeamManagementTransport({ ...options, fetcher }).list('  A & B%  ', 'opaque+/=')).toEqual(list);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('q')).toBe('A & B%'); expect(new URL(String(url)).searchParams.get('cursor')).toBe('opaque+/=');
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer synthetic-token', 'X-Clinic-Id': clinic } });
    expect(String(url)).not.toContain('password');
  });
  it('rejects foreign clinic/current user, duplicates and pages over ten', async () => {
    for (const invalid of [{ ...list, clinic_id: other }, { ...list, current_user_id: other }, { ...list, items: [member, member] }, { ...list, items: Array.from({ length: 11 }, () => member) }]) {
      const transport = createTeamManagementTransport({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(invalid)) });
      await expect(transport.list('', null)).rejects.toMatchObject({ kind: 'unavailable' });
    }
  });
  it('rejects late cancelled reads without publishing private data or firing stale expiry', async () => {
    const pending = deferred<Response>(), expired = vi.fn(), controller = new AbortController();
    const transport = createTeamManagementTransport({ ...options, onSessionExpired: expired, fetcher: vi.fn<typeof fetch>().mockReturnValue(pending.promise) });
    const promise = transport.list('', null, controller.signal); controller.abort(); pending.resolve(response({}, 401));
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' }); expect(expired).not.toHaveBeenCalled();
  });
  it('also rejects cancellation while response JSON is decoding', async () => {
    const json = deferred<unknown>(), controller = new AbortController();
    const transport = createTeamManagementTransport({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200, json: () => json.promise } as Response) });
    const read = transport.list('', null, controller.signal); await Promise.resolve(); controller.abort(); json.resolve(list);
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('distinguishes denied, expired, conflict and read unavailability', async () => {
    const denied = vi.fn(), expired = vi.fn();
    const transport = createTeamManagementTransport({ ...options, onAccessDenied: denied, onSessionExpired: expired, fetcher: vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 403)).mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({}, 503)) });
    await expect(transport.list('', null)).rejects.toMatchObject({ kind: 'denied' }); expect(denied).toHaveBeenCalledOnce();
    await expect(transport.list('', null)).rejects.toMatchObject({ kind: 'expired' }); expect(expired).toHaveBeenCalledOnce();
    await expect(transport.list('', null)).rejects.toMatchObject({ kind: 'unavailable' });
    const conflict = createTeamManagementTransport({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({}, 409)) });
    await expect(conflict.update(memberId, { expected_version: 1, roles: ['reception'], active: false }, other)).rejects.toMatchObject({ kind: 'conflict' });
  });
  it('retries a lost creation response with the identical command and idempotency key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(response({ clinic_id: clinic, member, replayed: true, clinical_role_notice }));
    const transport = createTeamManagementTransport({ ...options, fetcher });
    await expect(transport.create(create, other)).rejects.toMatchObject({ kind: 'uncertain' });
    expect(await transport.create(create, other)).toEqual(member);
    const first = fetcher.mock.calls[0]!, second = fetcher.mock.calls[1]!;
    expect(first[1]!.body).toBe(second[1]!.body); expect(first[1]!.headers).toEqual(second[1]!.headers);
    expect(JSON.parse(String(first[1]!.body))).toEqual({ ...create, email: create.email.toLowerCase() });
    expect(first[1]!.method).toBe('POST'); expect(String(first[0])).not.toContain(create.temporary_password);
    expect(new Headers(first[1]!.headers).get('Idempotency-Key')).toBe(other);
  });
  it('retains version and selected roles on updates and validates returned scope/version', async () => {
    const input = { expected_version: 1, roles: ['assistant' as const, 'reception' as const], active: false };
    const saved = { ...member, roles: input.roles, active: false, version: 2 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ clinic_id: clinic, member: saved, replayed: false, clinical_role_notice })).mockResolvedValueOnce(response({ clinic_id: other, member: saved, replayed: false, clinical_role_notice })).mockResolvedValueOnce(response({ clinic_id: clinic, member: { ...saved, version: 3 }, replayed: false, clinical_role_notice }));
    const transport = createTeamManagementTransport({ ...options, fetcher });
    expect(await transport.update(memberId, input, other)).toEqual(saved);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual(input); expect(fetcher.mock.calls[0]![1]!.method).toBe('PATCH');
    await expect(transport.update(memberId, input, other)).rejects.toMatchObject({ kind: 'uncertain' });
    await expect(transport.update(memberId, input, other)).rejects.toMatchObject({ kind: 'uncertain' });
  });
  it('never accepts an unexpected creation receipt including leaked password fields', async () => {
    for (const receipt of [{ clinic_id: other, member, replayed: false, clinical_role_notice }, { clinic_id: clinic, member: { ...member, temporary_password: 'unexpected' }, replayed: false, clinical_role_notice }, { clinic_id: clinic, member: { ...member, roles: ['manager'] }, replayed: false, clinical_role_notice }]) {
      const transport = createTeamManagementTransport({ ...options, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(receipt)) });
      await expect(transport.create(create, other)).rejects.toMatchObject({ kind: 'uncertain' });
    }
  });
  it('enforces password byte limits and at least one unique role before sending', async () => {
    expect(validTemporaryTeamPassword('a'.repeat(12))).toBe(true); expect(validTemporaryTeamPassword('a'.repeat(72))).toBe(true);
    expect(validTemporaryTeamPassword('a'.repeat(11))).toBe(false); expect(validTemporaryTeamPassword('é'.repeat(37))).toBe(false);
    const fetcher = vi.fn<typeof fetch>(), transport = createTeamManagementTransport({ ...options, fetcher });
    await expect(transport.create({ ...create, temporary_password: 'é'.repeat(37) }, other)).rejects.toMatchObject({ kind: 'invalid' });
    await expect(transport.create({ ...create, roles: [] }, other)).rejects.toMatchObject({ kind: 'invalid' });
    await expect(transport.create({ ...create, roles: ['reception', 'reception'] }, other)).rejects.toMatchObject({ kind: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled(); expect(sameTeamRoles(['manager', 'assistant'], ['assistant', 'manager'])).toBe(true);
  });
});
