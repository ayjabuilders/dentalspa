import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY, type IdentityPort, type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { A, B, STAFF, P1 } from '../fixtures';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase', async original => ({
  ...await original<object>(), scopedClient: () => ({ rpc }),
}));
const identity: IdentityPort = {
  verify: async token => ['manager', 'reception', 'dentist', 'assistant', 'inactive'].includes(token) ? STAFF : null,
  memberships: async token => [{ clinic_id: A, user_id: STAFF, role: (token === 'inactive' ? 'manager' : token) as StaffRole, active: token !== 'inactive' }],
  patientLinks: async () => [],
};
const settings = {
  schema_version: 1, revision: 1, time_zone: 'Africa/Casablanca', slot_step_minutes: 15,
  minimum_notice_minutes: 0, booking_horizon_days: 30, confirmation_mode: 'staff_review',
  patient_cancellation_enabled: false, patient_reschedule_enabled: false,
  cancellation_notice_minutes: 0, reschedule_notice_minutes: 0,
  weekly_windows: [], closures: [], visit_types: [],
};

describe('agenda settings HTTP authorization and validation', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(IDENTITY).useValue(identity).compile();
    app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('ENABLE_LOCAL_AGENDA_SETTINGS', 'true');
    vi.stubEnv('LOCAL_AGENDA_SETTINGS_GATE_KEY', 'synthetic-gate');
    rpc.mockReset().mockResolvedValue({ data: { settings, replayed: false }, error: null });
  });
  const save = (token = 'manager', clinic = A) => request(app.getHttpServer()).post('/api/v1/agenda-settings')
    .set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic).set('Idempotency-Key', P1);
  const payload = { expected_revision: 0, settings };
  it('denies unauthenticated, non-manager, inactive and foreign-clinic callers before storage', async () => {
    await request(app.getHttpServer()).post('/api/v1/agenda-settings').send(payload).expect(401);
    for (const role of ['reception', 'dentist', 'assistant', 'inactive']) await save(role).send(payload).expect(403);
    await save('manager', B).send(payload).expect(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('validates the complete configuration and prevents body/query tenant injection', async () => {
    await save().send({ ...payload, clinic_id: B }).expect(400);
    await save().query({ clinic_id: B }).send(payload).expect(400);
    await save().send({ ...payload, settings: { ...settings, slot_step_minutes: 0 } }).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('saves with the authorized clinic and returns a no-store receipt', async () => {
    const response = await save().send(payload).expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ settings, replayed: false });
    expect(rpc).toHaveBeenCalledWith('save_local_agenda_configuration', {
      p_expected_revision: 0, p_configuration: settings, p_request_key: P1, p_clinic_id: A, p_gate_key: 'synthetic-gate',
    });
  });
  it('reports revision conflict, rejects changed receipts and refuses hosted storage', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'SH409' } });
    await save().send(payload).expect(409);
    rpc.mockResolvedValueOnce({ data: { settings: { ...settings, booking_horizon_days: 90 }, replayed: false }, error: null });
    await save().send(payload).expect(503);
    rpc.mockClear(); vi.stubEnv('SUPABASE_URL', 'https://hosted.example.invalid');
    await save().send(payload).expect(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('reads an unconfigured clinic without inventing default working hours', async () => {
    rpc.mockResolvedValueOnce({ data: { settings: null }, error: null });
    const response = await request(app.getHttpServer()).get('/api/v1/agenda-settings')
      .set('Authorization', 'Bearer manager').set('X-Clinic-Id', A).expect(200);
    expect(response.body).toEqual({ settings: null });
  });

  it('calculates the manager preview from an authorized database snapshot only', async () => {
    const query = { date: '2026-11-02', visit_type_id: P1 };
    const read = (token = 'manager') => request(app.getHttpServer()).get('/api/v1/agenda-settings/availability').set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', A);
    await read('reception').query(query).expect(403);
    await read().query({ ...query, clinic_id: B }).expect(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { clinic_id: A, now: '2026-11-01T12:00:00Z', settings, resources: [], occupancy: [] }, error: null });
    const response = await read().query(query).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ ...query, revision: 1, time_zone: 'Africa/Casablanca', slots: [] });
    expect(rpc).toHaveBeenLastCalledWith('read_local_agenda_availability_snapshot', { p_date: query.date, p_clinic_id: A, p_gate_key: 'synthetic-gate' });
    rpc.mockResolvedValueOnce({ data: { clinic_id: B, now: '2026-11-01T12:00:00Z', settings, resources: [], occupancy: [] }, error: null });
    await read().query(query).expect(503);
    rpc.mockResolvedValueOnce({ data: { clinic_id: A, now: '2026-11-01T12:00:00Z', settings: null, resources: [], occupancy: [] }, error: null });
    await read().query(query).expect(503);
  });

  it('returns configured slots and removes overlaps from the storage snapshot', async () => {
    const configured = { ...settings, weekly_windows: [{ weekday: 1, start: '09:00', end: '12:00' }], visit_types: [{
      id: P1, name: 'Visite fictive', active: true, public_bookable: true, duration_minutes: 30,
      buffer_before_minutes: 0, buffer_after_minutes: 0, resource_pairs: [{ provider_id: STAFF, chair_id: B }],
      weekly_windows: [{ weekday: 1, start: '09:00', end: '10:00' }],
    }] };
    const snapshot = { clinic_id: A, now: '2026-11-01T12:00:00Z', settings: configured,
      resources: [{ id: STAFF, kind: 'provider' }, { id: B, kind: 'chair' }].map(resource => ({ ...resource, clinic_id: A, active: true, windows: [{ starts_at: '2026-11-02T08:00:00Z', ends_at: '2026-11-02T12:00:00Z' }] })),
      occupancy: [{ clinic_id: A, resource_id: STAFF, period: { starts_at: '2026-11-02T09:00:00Z', ends_at: '2026-11-02T09:30:00Z' } }],
    };
    rpc.mockResolvedValueOnce({ data: snapshot, error: null });
    const response = await request(app.getHttpServer()).get('/api/v1/agenda-settings/availability')
      .set('Authorization', 'Bearer manager').set('X-Clinic-Id', A).query({ date: '2026-11-02', visit_type_id: P1 }).expect(200);
    expect(response.body.slots).toEqual([{ starts_at: '2026-11-02T09:30:00.000Z', ends_at: '2026-11-02T10:00:00.000Z', provider_id: STAFF, chair_id: B }]);
    expect(response.body).not.toHaveProperty('occupancy');
    expect(response.body).not.toHaveProperty('resources');
  });
});
