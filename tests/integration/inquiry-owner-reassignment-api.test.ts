import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY, type IdentityPort, type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { INQUIRY_OWNER_REASSIGNMENT_REPOSITORY, type InquiryOwnerReassignmentRepository } from '../../apps/dental-api/src/intake/domain/owner-reassignment';
import { A, B, P1, P2, P3, STAFF } from '../fixtures';

const input = { expected_owner_user_id: STAFF, owner_user_id: P2 };
const receipt = { inquiry_id: P1, clinic_id: A, previous_owner_user_id: STAFF, owner_user_id: P2, changed: true, recorded_at: '2026-10-28T20:00:00.123Z', event_version: 1 as const };
const identity: IdentityPort = {
  verify: async token => ['manager', 'reception', 'assistant', 'inactive'].includes(token) ? STAFF : null,
  memberships: async token => [{ clinic_id: A, user_id: STAFF, role: (token === 'inactive' ? 'manager' : token) as StaffRole, active: token !== 'inactive' }],
  patientLinks: async () => [],
};

describe('inquiry owner reassignment HTTP boundary', () => {
  let app: INestApplication;
  const assign = vi.fn<InquiryOwnerReassignmentRepository['assign']>();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY).useValue(identity)
      .overrideProvider(INQUIRY_OWNER_REASSIGNMENT_REPOSITORY).useValue({ assign })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  beforeEach(() => { vi.stubEnv('ENABLE_INTAKE_COMMANDS', 'true'); assign.mockReset().mockResolvedValue({ receipt, replayed: false }); });

  const post = (token = 'manager', id = P1, clinic = A) => request(app.getHttpServer()).post(`/api/v1/inquiries/${id}/owner`)
    .set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic).set('Idempotency-Key', P3);

  it('returns a no-store created receipt and a 200 replay', async () => {
    expect((await post().send(input).expect(201)).body).toEqual({ receipt, replayed: false });
    assign.mockResolvedValueOnce({ receipt, replayed: true });
    const replay = await post().send(input).expect(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.headers['cache-control']).toBe('no-store');
  });

  it('is manager-only, active-membership-only, tenant-scoped, and disabled by default', async () => {
    await request(app.getHttpServer()).post(`/api/v1/inquiries/${P1}/owner`).send(input).expect(401);
    for (const role of ['reception', 'assistant', 'inactive']) await post(role).send(input).expect(403);
    await post('manager', P1, B).send(input).expect(403);
    vi.stubEnv('ENABLE_INTAKE_COMMANDS', undefined);
    const disabled = await post().send(input).expect(503);
    expect(disabled.body.code).toBe('intake_disabled');
    expect(assign).not.toHaveBeenCalled();
  });

  it('rejects malformed paths, keys, queries and strict bodies before the provider', async () => {
    await post().query({ clinic_id: A }).send(input).expect(400);
    await post('manager', 'bad-id').send(input).expect(400);
    await post().unset('Idempotency-Key').send(input).expect(400);
    for (const body of [{}, { owner_user_id: P2 }, { ...input, clinic_id: A }]) await post().send(body).expect(400);
    expect(assign).not.toHaveBeenCalled();
  });

  it('sanitizes owner conflicts, foreign inquiries and provider failures', async () => {
    assign.mockRejectedValueOnce(new NotFoundException('private foreign inquiry'));
    expect((await post().send(input).expect(404)).text).not.toContain('private');
    assign.mockRejectedValueOnce(new ConflictException('private prior owner'));
    expect((await post().send(input).expect(409)).text).not.toContain('private');
    assign.mockRejectedValueOnce(new ForbiddenException('private target membership'));
    expect((await post().send(input).expect(403)).text).not.toContain('private');
    assign.mockRejectedValueOnce(new ServiceUnavailableException('private provider detail'));
    const unavailable = await post().send(input).expect(503);
    expect(unavailable.headers['cache-control']).toBe('no-store');
    expect(unavailable.text).not.toContain('private');
  });

  it('rejects mismatched provider receipts rather than returning another tenant or owner', async () => {
    for (const patch of [{ clinic_id: B }, { inquiry_id: P2 }, { previous_owner_user_id: P3 }, { owner_user_id: P3 }, { changed: false }, { email: 'private@example.test' }]) {
      assign.mockResolvedValueOnce({ receipt: { ...receipt, ...patch }, replayed: false } as never);
      const result = await post().send(input).expect(503);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.text).not.toContain('private');
    }
  });
});
