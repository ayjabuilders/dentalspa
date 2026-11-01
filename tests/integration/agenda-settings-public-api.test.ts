import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { A, B, STAFF, P1, P2 } from '../fixtures';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase', async original => ({ ...await original<object>(), scopedClient: () => ({ rpc }) }));
function snapshot() {
  const visit = { id: P1, name: 'Première visite fictive', active: true, public_bookable: true, duration_minutes: 30, buffer_before_minutes: 0, buffer_after_minutes: 0,
    resource_pairs: [{ provider_id: STAFF, chair_id: B }], weekly_windows: [{ weekday: 1, start: '09:00', end: '10:00' }] };
  return { clinic_id: A, now: '2026-11-01T12:00:00Z', settings: {
    schema_version: 1, revision: 1, time_zone: 'Africa/Casablanca', slot_step_minutes: 15, minimum_notice_minutes: 0, booking_horizon_days: 30,
    confirmation_mode: 'staff_review', patient_cancellation_enabled: false, patient_reschedule_enabled: false, cancellation_notice_minutes: 0, reschedule_notice_minutes: 0,
    weekly_windows: [{ weekday: 1, start: '09:00', end: '12:00' }], closures: [], visit_types: [visit, { ...visit, id: P2, name: 'Contrôle privé', public_bookable: false }],
  }, resources: [{ id: STAFF, kind: 'provider' }, { id: B, kind: 'chair' }].map(resource => ({ ...resource, clinic_id: A, active: true,
    windows: [{ starts_at: '2026-11-02T08:00:00Z', ends_at: '2026-11-02T12:00:00Z' }] })),
    occupancy: [{ clinic_id: A, resource_id: STAFF, period: { starts_at: '2026-11-02T09:00:00Z', ends_at: '2026-11-02T09:30:00Z' } }],
  };
}
describe('configured public agenda HTTP projection', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => { await app.close(); vi.unstubAllEnvs(); });
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321'); vi.stubEnv('ENABLE_LOCAL_PUBLIC_AGENDA', 'true');
    vi.stubEnv('LOCAL_PUBLIC_AGENDA_CLINIC_ID', A); vi.stubEnv('LOCAL_PUBLIC_AGENDA_GATE_KEY', 'test-public-gate');
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','false');
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','false');
    rpc.mockReset().mockResolvedValue({ data: snapshot(), error: null });
  });
  const read = (query: Record<string, string | undefined> = {}) => request(app.getHttpServer()).get('/api/v1/booking-requests/configured-availability').query({ date: '2026-11-02', ...query });
  it('requires no patient login and exposes only public type metadata and available times', async () => {
    const response = await read({ visit_type_id: P1 }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ date: '2026-11-02', time_zone: 'Africa/Casablanca', revision: 1, informational: true, selected_visit_type_id: P1,confirmation_mode:'staff_review',
      visit_types: [{ id: P1, name: 'Première visite fictive', duration_minutes: 30 }],
      slots: [{ starts_at: '2026-11-02T09:30:00.000Z', ends_at: '2026-11-02T10:00:00.000Z' }],
    });
    expect(JSON.stringify(response.body)).not.toContain(STAFF);
    expect(JSON.stringify(response.body)).not.toContain(P2);
    expect(rpc).toHaveBeenCalledWith('read_local_public_agenda_snapshot', { p_clinic_id: A, p_date: '2026-11-02', p_gate_key: 'test-public-gate' });
  });
  it('returns catalog without slots until a public type is selected; private IDs grant no access', async () => {
    for (const query of [{}, { visit_type_id: P2 }, { visit_type_id: B }]) {
      const response = await read(query).expect(200);
      expect(response.body.selected_visit_type_id).toBeNull(); expect(response.body.slots).toEqual([]);
    }
  });
  it('deduplicates times across resource pairs without exposing resource identities', async () => {
    const data = snapshot();
    data.resources.push({ ...data.resources[0]!, id: P2 });
    data.settings.visit_types[0]!.resource_pairs.push({ provider_id: P2, chair_id: B });
    data.occupancy = [];
    rpc.mockResolvedValueOnce({ data, error: null });
    const response = await read({ visit_type_id: P1 }).expect(200);
    expect(response.body.slots).toHaveLength(3);
    expect(new Set(response.body.slots.map((slot: { starts_at: string }) => slot.starts_at)).size).toBe(3);
    expect(JSON.stringify(response.body)).not.toContain(P2);
    expect(JSON.stringify(response.body)).not.toContain(B);
  });
  it('rejects tenant, patient and scheduling injection before reading storage', async () => {
    for (const extra of [{ clinic_id: B }, { patient_id: P2 }, { now: '2026-11-01' }, { settings: '{}' }, { date: 'invalid' }]) await read(extra).expect(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('fails closed on malformed, foreign, missing or unavailable snapshots', async () => {
    for (const data of [null, { ...snapshot(), clinic_id: B }, { ...snapshot(), resources: [{ bad: true }] }, { ...snapshot(), settings: null }]) {
      rpc.mockResolvedValueOnce({ data, error: null }); await read({ visit_type_id: P1 }).expect(503);
    }
    rpc.mockRejectedValueOnce(new Error('private internal diagnostic')); const response = await read().expect(503);
    expect(JSON.stringify(response.body)).not.toContain('diagnostic');
  });
  it('refuses hosted targets and disabled local activation before any storage request', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.invalid'); await read().expect(503);
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321'); vi.stubEnv('ENABLE_LOCAL_PUBLIC_AGENDA', 'false'); await read().expect(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  const payload={visit_type_id:P1,configuration_revision:1,starts_at:'2026-11-02T09:30:00.000Z',ends_at:'2026-11-02T10:00:00.000Z',contact_name:'Salma fictive',contact_email:'salma@example.test',administrative_consent_version:'local-demo-v1'};
  const submit=()=>request(app.getHttpServer()).post('/api/v1/booking-requests/configured').set('Idempotency-Key',P2);
  const received={request_id:P2,status:'request_received',replayed:false};
  const newRequest=()=>{vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','true');rpc.mockReset().mockResolvedValueOnce({data:null,error:{code:'SH409'}}).mockResolvedValueOnce({data:snapshot(),error:null}).mockResolvedValueOnce({data:received,error:null});};
  it('keeps writes off by default and validates synthetic identity consent and client scope',async()=>{
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','false');await submit().send(payload).expect(503);
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','true');
    for(const invalid of [{...payload,clinic_id:B},{...payload,contact_email:'salma@real.invalid'},{...payload,administrative_consent_version:null},{...payload,configuration_revision:0}])await submit().send(invalid).expect(400);
    await submit().query({clinic_id:B}).send(payload).expect(400);await submit().unset('Idempotency-Key').send(payload).expect(400);expect(rpc).not.toHaveBeenCalled();
  });
  it('validates current availability then persists through the guarded snapshot command',async()=>{
    newRequest();const response=await submit().send(payload).expect(201);expect(response.body).toEqual(received);expect(response.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenNthCalledWith(1,'create_local_configured_booking_request',{p_clinic_id:A,p_request_key:P2,p_payload:payload,p_validated_snapshot:null,p_gate_key:'test-public-gate'});
    expect(rpc).toHaveBeenLastCalledWith('create_local_configured_booking_request',{p_clinic_id:A,p_request_key:P2,p_payload:payload,p_validated_snapshot:snapshot(),p_gate_key:'test-public-gate'});
  });
  it('recovers an already committed request without rechecking changed availability',async()=>{
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','true');rpc.mockReset().mockResolvedValue({data:{...received,replayed:true},error:null});
    await submit().send(payload).expect(201);expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects old revision, occupied/private/non-grid slots before new persistence',async()=>{
    for(const body of [{...payload,configuration_revision:2},{...payload,starts_at:'2026-11-02T09:00:00.000Z',ends_at:'2026-11-02T09:30:00.000Z'},{...payload,visit_type_id:P2},{...payload,starts_at:'2026-11-02T09:31:00.000Z',ends_at:'2026-11-02T10:01:00.000Z'}]){
      newRequest();await submit().send(body).expect(409);expect(rpc).toHaveBeenCalledTimes(2);
    }
  });
  it('reports a concurrent snapshot change and refuses false confirmation receipts',async()=>{
    newRequest();rpc.mockReset().mockResolvedValueOnce({data:null,error:{code:'SH409'}}).mockResolvedValueOnce({data:snapshot(),error:null}).mockResolvedValueOnce({data:null,error:{code:'SH409'}});await submit().send(payload).expect(409);
    newRequest();rpc.mockReset().mockResolvedValueOnce({data:null,error:{code:'SH409'}}).mockResolvedValueOnce({data:snapshot(),error:null}).mockResolvedValueOnce({data:{...received,status:'confirmed'},error:null});await submit().send(payload).expect(503);
  });
  it('rejects altered retry keys, foreign snapshots, unsupported automatic mode and hosted writes',async()=>{
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','true');rpc.mockReset().mockResolvedValue({data:null,error:{code:'SH410'}});await submit().send(payload).expect(409);
    for(const data of [{...snapshot(),clinic_id:B},{...snapshot(),settings:{...snapshot().settings,confirmation_mode:'automatic'}}]){rpc.mockReset().mockResolvedValueOnce({data:null,error:{code:'SH409'}}).mockResolvedValueOnce({data,error:null});await submit().send(payload).expect(503);}
    rpc.mockClear();vi.stubEnv('SUPABASE_URL','https://hosted.example.invalid');await submit().send(payload).expect(503);expect(rpc).not.toHaveBeenCalled();
  });
  it('automatically confirms only with enabled local gate and returns minimal receipt',async()=>{
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','true');vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','true');
    const data={...snapshot(),settings:{...snapshot().settings,confirmation_mode:'automatic'}};
    const acknowledgement={request_id:P2,appointment_id:A,status:'confirmed',starts_at:payload.starts_at,ends_at:payload.ends_at,replayed:false};
    rpc.mockReset().mockResolvedValueOnce({data:null,error:{code:'SH409'}}).mockResolvedValueOnce({data,error:null}).mockResolvedValueOnce({data:acknowledgement,error:null});
    expect((await submit().send(payload).expect(201)).body).toEqual(acknowledgement);
    rpc.mockReset().mockResolvedValueOnce({data:{...acknowledgement,replayed:true},error:null});await submit().send(payload).expect(201);expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockReset().mockResolvedValueOnce({data,error:null});const available=await read({visit_type_id:P1}).expect(200);expect(available.body.confirmation_mode).toBe('automatic');expect(available.body.request_enabled).toBe(true);
  });
  it('rejects automatic pending receipts and mismatched appointment intervals',async()=>{
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS','true');vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','true');
    for(const receipt of [received,{request_id:P2,appointment_id:A,status:'confirmed',starts_at:payload.starts_at,ends_at:'2026-11-02T10:30:00.000Z',replayed:false}]){
      rpc.mockReset().mockResolvedValueOnce({data:null,error:{code:'SH409'}}).mockResolvedValueOnce({data:{...snapshot(),settings:{...snapshot().settings,confirmation_mode:'automatic'}},error:null}).mockResolvedValueOnce({data:receipt,error:null});await submit().send(payload).expect(503);
    }
  });
});
