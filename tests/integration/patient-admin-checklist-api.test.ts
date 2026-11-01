import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY, type IdentityPort, type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { PATIENT_REPOSITORY } from '../../apps/dental-api/src/patients/domain/patient';
import { PATIENT_ADMIN_CHECKLIST_REPOSITORY } from '../../apps/dental-api/src/patients/domain/patient-admin-checklist';
import { PatientsService } from '../../apps/dental-api/src/patients/application/patients.service';
import { safeCorrelation } from '../../apps/dental-api/src/audit/redaction';
import { A, P1, STAFF } from '../fixtures';

const KEY = '50000000-0000-4000-8000-000000000001';
const item = { clinic_id: A, patient_id: P1, kind: 'cnss' as const, status: 'received' as const, revision: 1, updated_at: '2026-10-30T00:00:00.000Z', updated_by: STAFF };
const list = { schema_version: 1 as const, clinic_id: A, patient_id: P1, items: [item] };
const identity: IdentityPort = {
  verify: async token => ['reception','manager','dentist','assistant'].includes(token) ? STAFF : null,
  memberships: async token => ['reception','manager','dentist','assistant'].includes(token)
    ? [{ clinic_id: A, user_id: STAFF, role: token as StaffRole, active: true }]
    : [],
  patientLinks: async () => [],
};

describe('clinic admin document checklist HTTP boundary', () => {
  let app: INestApplication;
  const listChecklist = vi.fn();
  const setChecklist = vi.fn();
  const originalFlag = process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY).useValue(identity)
      .overrideProvider(PATIENT_REPOSITORY).useValue({
        list: async () => [], find: async () => null, lookup: async () => ({ items: [], truncated: false }),
        readOwnProfile: async () => null, getOwnCommunicationPreferences: async () => { throw new Error('not used'); },
        setOwnCommunicationPreferences: async () => { throw new Error('not used'); },
      })
      .overrideProvider(PATIENT_ADMIN_CHECKLIST_REPOSITORY).useValue({ listChecklist, setChecklist })
      .compile();
    app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1');
    app.use((req: Request & { correlationId?: string }, res: Response, next: NextFunction) => {
      req.correlationId = safeCorrelation(req.headers['x-correlation-id']); res.setHeader('X-Correlation-Id', req.correlationId); next();
    });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (originalFlag === undefined) delete process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST;
    else process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST = originalFlag;
  });
  beforeEach(() => {
    process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST = 'false';
    listChecklist.mockReset().mockResolvedValue(list);
    setChecklist.mockReset().mockResolvedValue({ item, replayed: false });
  });

  const base = (token = 'reception') => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', A),
    post: (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', A),
  });
  const path = `/api/v1/patients/${P1}/admin-document-checklist`;

  it('fails closed while disabled and never reads or writes through the repository', async () => {
    await base().get(path).expect(503);
    await base().post(path).set('Idempotency-Key', KEY).send({ expected_revision: 0, kind: 'cnss', status: 'received' }).expect(503);
    expect(listChecklist).not.toHaveBeenCalled(); expect(setChecklist).not.toHaveBeenCalled();
  });

  it('returns no-store data from only the active selected clinic with an empty-query contract', async () => {
    process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST = 'true';
    expect(app.get(PATIENT_ADMIN_CHECKLIST_REPOSITORY).listChecklist).toBe(listChecklist);
    expect((app.get(PatientsService) as unknown as { checklistRepository: unknown }).checklistRepository).toBe(app.get(PATIENT_ADMIN_CHECKLIST_REPOSITORY));
    const response = await base().get(path);
    expect(response.status, JSON.stringify({ body: response.body, calls: listChecklist.mock.calls })).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store'); expect(response.body).toEqual(list);
    expect(listChecklist).toHaveBeenCalledOnce();
    expect(listChecklist.mock.calls[0]?.[0]).toMatchObject({ userId: STAFF, clinicId: A, roles: ['reception'] });
    expect(listChecklist.mock.calls[0]?.[1]).toBe(P1);
    await base().get(path).query({ patient_id: 'foreign' }).expect(400);
    await base('assistant').get(path).expect(403);
    await base('reception').get(`/api/v1/patients/${P1}/admin-document-checklist`).set('X-Clinic-Id', '10000000-0000-4000-8000-000000000002').expect(403);
    expect(listChecklist).toHaveBeenCalledOnce();
  });

  it('records only strict PRD status commands and distinguishes create, exact replay and conflicts', async () => {
    process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST = 'true';
    const body = { expected_revision: 0, kind: 'cnss', status: 'received' };
    const created = await base().post(path).set('Idempotency-Key', KEY).send(body).expect(201);
    expect(created.headers['cache-control']).toBe('no-store'); expect(created.body).toEqual({ item, replayed: false });
    expect(setChecklist.mock.calls[0]?.slice(0, 4)).toMatchObject([{ userId: STAFF, clinicId: A, roles: ['reception'] }, P1, body, KEY]);
    setChecklist.mockResolvedValueOnce({ item, replayed: true });
    await base().post(path).set('Idempotency-Key', KEY).send(body).expect(200, { item, replayed: true });
    setChecklist.mockRejectedValueOnce({ code: 'PT409' });
    await base().post(path).set('Idempotency-Key', '50000000-0000-4000-8000-000000000002').send({ ...body, expected_revision: 1, status: 'missing' }).expect(409);
    await base().post(path).set('Idempotency-Key', KEY).send({ ...body, note: 'private' }).expect(400);
    await base().post(path).set('Idempotency-Key', KEY).send({ ...body, status: 'reimbursed' }).expect(400);
    await base().post(`${path}?patient_id=other`).set('Idempotency-Key', KEY).send(body).expect(400);
    await base('assistant').post(path).set('Idempotency-Key', KEY).send(body).expect(403);
  });

  it('fails closed if a repository returns duplicate or cross-clinic checklist records', async () => {
    process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST = 'true';
    listChecklist.mockResolvedValueOnce({ ...list, items: [{ ...item, clinic_id: '10000000-0000-4000-8000-000000000002' }] });
    await base().get(path).expect(503);
    listChecklist.mockResolvedValueOnce({ ...list, items: [item, item] });
    await base().get(path).expect(503);
  });
});
