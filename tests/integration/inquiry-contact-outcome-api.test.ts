import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY, type IdentityPort, type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { INQUIRY_CONTACT_OUTCOME_REPOSITORY, type InquiryContactOutcomeRepository } from '../../apps/dental-api/src/intake/domain/contact-outcome';
import { A, B, P1, P2, P3, STAFF } from '../fixtures';

const event = { id: P3, clinic_id: A, inquiry_id: P1, outcome: 'reached' as const, recorded_at: '2026-10-29T10:00:00.123Z', event_version: 1 as const };
const list = { clinic_id: A, inquiry_id: P1, items: [event], truncated: false };
const input = { outcome: 'reached' as const };
const identity: IdentityPort = {
  verify: async token => ['reception', 'manager', 'dentist', 'assistant', 'inactive'].includes(token) ? STAFF : null,
  memberships: async token => [{ clinic_id: A, user_id: STAFF, role: (token === 'inactive' ? 'reception' : token) as StaffRole, active: token !== 'inactive' }],
  patientLinks: async () => [],
};

describe('inquiry factual contact outcome HTTP boundary', () => {
  let app: INestApplication;
  const read = vi.fn<InquiryContactOutcomeRepository['list']>();
  const record = vi.fn<InquiryContactOutcomeRepository['record']>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY).useValue(identity)
      .overrideProvider(INQUIRY_CONTACT_OUTCOME_REPOSITORY).useValue({ list: read, record })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  beforeEach(() => {
    vi.stubEnv('ENABLE_INQUIRY_CONTACT_OUTCOMES', 'true');
    read.mockReset().mockResolvedValue(list);
    record.mockReset().mockResolvedValue({ item: event, replayed: false });
  });

  const get = (token = 'reception', id = P1, clinic = A) => request(app.getHttpServer()).get(`/api/v1/inquiries/${id}/contact-outcomes`).set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic);
  const post = (token = 'reception', id = P1, clinic = A) => request(app.getHttpServer()).post(`/api/v1/inquiries/${id}/contact-outcomes`).set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic).set('Idempotency-Key', P2);

  it('returns owner histories no-store and supports append/replay receipts', async () => {
    expect((await get().expect(200)).body).toEqual(list);
    const created = await post().send(input).expect(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body).toEqual({ item: event, replayed: false });
    record.mockResolvedValueOnce({ item: event, replayed: true });
    expect((await post().send(input).expect(200)).body.replayed).toBe(true);
  });

  it('keeps reads and writes disabled by default until privacy review', async () => {
    vi.stubEnv('ENABLE_INQUIRY_CONTACT_OUTCOMES', undefined);
    const getResult = await get().expect(503);
    expect(getResult.body.code).toBe('contact_outcomes_disabled');
    expect(getResult.headers['cache-control']).toBe('no-store');
    const postResult = await post().send(input).expect(503);
    expect(postResult.body.code).toBe('contact_outcomes_disabled');
    expect(read).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('requires an active same-clinic role and rejects assistants or foreign scope before the repository', async () => {
    await get('expired').expect(401);
    for (const role of ['assistant', 'inactive']) { await get(role).expect(403); await post(role).send(input).expect(403); }
    await get('reception', P1, B).expect(403);
    await post('reception', P1, B).send(input).expect(403);
    expect(read).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects malformed identifiers, query parameters, keys, extra or unapproved labels', async () => {
    await get().query({ clinic_id: B }).expect(400);
    await post().query({ clinic_id: B }).send(input).expect(400);
    await get('reception', 'not-an-id').expect(400);
    await post().unset('Idempotency-Key').send(input).expect(400);
    for (const body of [{}, { outcome: 'not_attempted' }, { outcome: 'triage' }, { ...input, clinic_id: A }, { ...input, note: 'private content' }]) await post().send(body).expect(400);
    expect(read).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('sanitizes foreign, conflict and provider failures', async () => {
    read.mockRejectedValueOnce(new NotFoundException('private foreign inquiry'));
    expect((await get().expect(404)).text).not.toContain('private');
    record.mockRejectedValueOnce(new ConflictException('private idempotency state'));
    expect((await post().send(input).expect(409)).text).not.toContain('private');
    record.mockRejectedValueOnce(new ForbiddenException('private owner id'));
    expect((await post().send(input).expect(403)).text).not.toContain('private');
    record.mockRejectedValueOnce(new ServiceUnavailableException('private SQL detail'));
    expect((await post().send(input).expect(503)).text).not.toContain('private');
  });

  it('rejects provider projections from another clinic or inquiry', async () => {
    for (const patch of [{ clinic_id: B }, { inquiry_id: P3 }, { outcome: 'not_attempted' }, { event_version: 2 }]) {
      read.mockResolvedValueOnce({ ...list, items: [{ ...event, ...patch }] } as never);
      await get().expect(503);
    }
    record.mockResolvedValueOnce({ item: { ...event, clinic_id: B }, replayed: false } as never);
    const response = await post().send(input).expect(503);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
