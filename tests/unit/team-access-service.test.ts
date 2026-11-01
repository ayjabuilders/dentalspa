import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../apps/dental-api/src/identity/domain/access';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase', () => ({ scopedClient: () => ({ rpc: mocks.rpc }) }));

import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { TeamAccessService } from '../../apps/dental-api/src/team/application/team-access.service';

const clinic = '10000000-0000-4000-8000-000000000001';
const managerId = '20000000-0000-4000-8000-000000000001';
const memberId = '20000000-0000-4000-8000-000000000002';
const reservationId = '30000000-0000-4000-8000-000000000001';
const requestKey = '40000000-0000-4000-8000-000000000001';
const createdAt = '2026-11-01T12:00:00.000Z';
const notice = 'Clinical roles grant application access only; they do not verify professional qualifications.';
const actor: Actor = { userId: managerId, token: 'manager-token', clinicId: clinic, roles: ['manager'] };
const member = { user_id: memberId, display_name: 'Salma El Amrani', email: 'salma@example.test', roles: ['assistant'], active: true, version: 1, created_at: createdAt };
const receipt = { clinic_id: clinic, member, replayed: false, clinical_role_notice: notice };
const createdUser = { id: memberId, email: 'salma@example.test', app_metadata: { local_team_provisioning_id: reservationId } };

describe('local team access manager service', () => {
  const authAdmin = { createUser: vi.fn(), listUsers: vi.fn() };
  const service = new TeamAccessService(authAdmin);
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'local-test-service-key');
    vi.stubEnv('ENABLE_LOCAL_TEAM_ACCESS', 'true');
    vi.stubEnv('LOCAL_TEAM_ACCESS_GATE_KEY', 'local-gate-key');
    mocks.rpc.mockReset(); authAdmin.createUser.mockReset(); authAdmin.listUsers.mockReset();
    authAdmin.listUsers.mockResolvedValue({ users: [], error: false });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['PT409', '40001'])('maps version conflict %s to HTTP 409 without provisioning Auth', async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } });
    await expect(service.update(actor, memberId, { expected_version: 1, roles: ['assistant'], active: true }, requestKey)).rejects.toBeInstanceOf(ConflictException);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it.each(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])('requires pinned hosted activation and retains manager/tenant checks with %s', async keyName => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv(keyName, 'synthetic-hosted-admin-key');
    vi.stubEnv('SUPABASE_URL', 'https://giufpdppsunryyhfnzps.supabase.co');
    vi.stubEnv('HOSTED_SUPABASE_PROJECT_REF', 'giufpdppsunryyhfnzps');
    vi.stubEnv('HOSTED_TEAM_ACCESS_GATE_KEY', 'hosted-team-key');
    await expect(service.list(actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.rpc).not.toHaveBeenCalled();
    vi.stubEnv('ENABLE_HOSTED_TEAM_ACCESS', 'true');
    await expect(service.list({ ...actor, roles: ['assistant'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.rpc).not.toHaveBeenCalled();
    const list = { schema_version: 1, clinic_id: clinic, current_user_id: managerId, items: [member], next_cursor: null, clinical_role_notice: notice };
    mocks.rpc.mockResolvedValue({ data: list, error: null });
    expect(await service.list(actor)).toEqual(list);
    expect(mocks.rpc).toHaveBeenCalledWith('list_team_access_members', expect.objectContaining({ p_clinic_id: clinic, p_gate: 'hosted-team-key' }), { get: false, head: false });
    mocks.rpc.mockResolvedValueOnce({ data: { ...list, clinic_id: memberId }, error: null });
    await expect(service.list(actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
    mocks.rpc.mockClear();
    vi.stubEnv('HOSTED_SUPABASE_PROJECT_REF', 'dbnxfqjevdffgrkvczli');
    await expect(service.list(actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it('fails closed unless the dedicated gate and exact loopback Auth endpoint are configured', async () => {
    for (const url of ['https://example.supabase.co', 'http://127.0.0.1:54320', 'https://localhost:54321']) {
      vi.stubEnv('SUPABASE_URL', url);
      await expect(service.list(actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  });

  it('does not call Auth Admin or database for a non-manager', async () => {
    await expect(service.list({ ...actor, roles: ['dentist'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(authAdmin.createUser).not.toHaveBeenCalled(); expect(authAdmin.listUsers).not.toHaveBeenCalled();
  });

  it('validates scoped list projection, literal search and cursor before returning it', async () => {
    const list = { schema_version: 1, clinic_id: clinic, current_user_id: managerId, items: [member], next_cursor: null, clinical_role_notice: notice };
    mocks.rpc.mockResolvedValue({ data: list, error: null });
    expect(await service.list(actor, 'Salma')).toEqual(list);
    expect(mocks.rpc).toHaveBeenCalledWith('list_team_access_members', expect.objectContaining({ p_clinic_id: clinic, p_query: 'Salma', p_cursor: null, p_gate: 'local-gate-key' }), { get: false, head: false });
    await expect(service.list(actor, ' Salma')).rejects.toThrow();
    await expect(service.list(actor, undefined, 'tampered')).rejects.toThrow();
    mocks.rpc.mockResolvedValueOnce({ data: { ...list, clinic_id: '10000000-0000-4000-8000-000000000002' }, error: null });
    await expect(service.list(actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates an Auth-only local account, finalizes membership and never returns the temporary password', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'reserve_local_team_member'
      ? { data: { reservation_id: reservationId, auth_user_id: null, completed: false, replayed: false }, error: null }
      : { data: { receipt, replayed: false }, error: null });
    authAdmin.createUser.mockResolvedValue({ user: createdUser });
    const result = await service.create(actor, { display_name: 'Salma El Amrani', email: 'Salma@example.test', temporary_password: 'temporary-strong-password', roles: ['assistant'] }, requestKey);
    expect(result).toEqual(receipt);
    expect(JSON.stringify(result)).not.toContain('temporary-strong-password');
    expect(authAdmin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true, app_metadata: { local_team_provisioning_id: reservationId } }));
    expect(authAdmin.createUser.mock.calls[0]?.[0]).not.toHaveProperty('emailRedirectTo');
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'reserve_local_team_member', expect.objectContaining({ p_email: 'salma@example.test', p_request_key: requestKey, p_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }), { get: false, head: false });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'finalize_local_team_member', expect.objectContaining({ p_auth_user_id: memberId, p_reservation_id: reservationId }), { get: false, head: false });
  });

  it('reconciles an Auth create whose response was lost without creating a second account', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'reserve_local_team_member'
      ? { data: { reservation_id: reservationId, completed: false, replayed: true }, error: null }
      : { data: { receipt: { ...receipt, replayed: true }, replayed: true }, error: null });
    authAdmin.listUsers.mockResolvedValue({ users: [createdUser], error: false });
    const result = await service.create(actor, { display_name: 'Salma El Amrani', email: 'salma@example.test', temporary_password: 'temporary-strong-password', roles: ['assistant'] }, requestKey);
    expect(result.replayed).toBe(true);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('finalize_local_team_member', expect.objectContaining({ p_auth_user_id: memberId }), { get: false, head: false });
  });

  it('does not attach an existing unrelated Auth identity and asks SQL to release only its reservation', async () => {
    mocks.rpc.mockResolvedValue({ data: { reservation_id: reservationId, completed: false }, error: null });
    authAdmin.listUsers.mockResolvedValue({ users: [{ ...createdUser, app_metadata: {} }], error: false });
    await expect(service.create(actor, { display_name: 'Salma El Amrani', email: 'salma@example.test', temporary_password: 'temporary-strong-password', roles: ['assistant'] }, requestKey)).rejects.toThrow('An Auth account with this email already exists');
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith('release_foreign_local_team_member_reservation', expect.objectContaining({ p_reservation_id: reservationId, p_request_key: requestKey }), { get: false, head: false });
  });

  it('releases only the uncommitted reservation after a definite local Auth validation rejection', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'reserve_local_team_member'
      ? { data: { reservation_id: reservationId, completed: false }, error: null }
      : { data: true, error: null });
    authAdmin.createUser.mockResolvedValue({ user: null, error: { message: 'weak password', status: 422 } });
    await expect(service.create(actor, { display_name: 'Salma El Amrani', email: 'salma@example.test', temporary_password: 'temporary-strong-password', roles: ['assistant'] }, requestKey)).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.rpc).toHaveBeenLastCalledWith('release_foreign_local_team_member_reservation', expect.objectContaining({ p_reservation_id: reservationId }), { get: false, head: false });
    expect(mocks.rpc).not.toHaveBeenCalledWith('finalize_local_team_member', expect.anything(), expect.anything());
  });

  it('passes expected version and verifies that the receipt cannot escape the current clinic or target user', async () => {
    await expect(service.update(actor, managerId, { expected_version: 1, roles: ['manager'], active: true }, requestKey)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: { receipt: { ...receipt, member: { ...member, version: 2 } }, replayed: false }, error: null });
    const result = await service.update(actor, memberId, { expected_version: 1, roles: ['dentist'], active: false }, requestKey);
    expect(result.member.version).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith('update_team_access_member', expect.objectContaining({ p_target_user_id: memberId, p_expected_version: 1, p_roles: ['dentist'], p_active: false }), { get: false, head: false });
    mocks.rpc.mockResolvedValueOnce({ data: { receipt: { ...receipt, clinic_id: '10000000-0000-4000-8000-000000000002' }, replayed: false }, error: null });
    await expect(service.update(actor, memberId, { expected_version: 1, roles: ['dentist'], active: false }, requestKey)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
