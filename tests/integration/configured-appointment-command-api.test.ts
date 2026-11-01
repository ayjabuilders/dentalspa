import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY, type IdentityPort, type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { A,B,STAFF,P1,P2 } from '../fixtures';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',async original=>({...await original<object>(),scopedClient:()=>({rpc})}));
const identity:IdentityPort={
  verify:async token=>['manager','reception','dentist','assistant','inactive'].includes(token)?STAFF:null,
  memberships:async token=>[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'manager':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[],
};
describe('configured appointment cancellation HTTP boundary',()=>{
  it('protects patient association and binds it to the authorized clinic', async () => {
    const url = `/api/v1/appointments/${P1}/patient-association`;
    const input = { patient_id: P2, expected_version: 1 };
    const send = (token = 'manager', clinic = A) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic).set('Idempotency-Key', P2);
    await request(app.getHttpServer()).post(url).send(input).expect(401);
    for (const role of ['assistant', 'dentist', 'inactive']) await send(role).send(input).expect(403);
    await send('manager', B).send(input).expect(403);
    await send().send({ ...input, identity_verified: true }).expect(400);
    await send().query({ patient_id: P1 }).send(input).expect(400);
    await send().unset('Idempotency-Key').send(input).expect(400);
    expect(rpc).not.toHaveBeenCalled();
    const receipt = { appointment_id: P1, patient_id: P2, version: 2, association_status: 'possible_match', identity_verified: false, replayed: false };
    rpc.mockResolvedValueOnce({ data: receipt, error: null });
    const response = await send('reception').send(input).expect(201);
    expect(response.body).toEqual(receipt);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('associate_local_configured_appointment_patient', { p_clinic_id: A, p_appointment_id: P1, p_patient_id: P2, p_expected_version: 1, p_request_key: P2, p_gate_key: 'synthetic-test' });
    for (const change of [{ identity_verified: true }, { patient_id: P1 }, { appointment_id: P2 }, { version: 3 }, { association_status: 'unlinked' }]) {
      rpc.mockResolvedValueOnce({ data: { ...receipt, ...change }, error: null });
      await send().send(input).expect(503);
    }
    rpc.mockResolvedValueOnce({ data: { ...receipt, patient_id: null, association_status: 'unlinked' }, error: null });
    await send().send({ ...input, patient_id: null }).expect(201);
    for (const [code, status] of [['SH409', 409], ['SH410', 409], ['SH404', 404], ['42501', 403], ['28000', 403], ['PT503', 503]] as const) {
      rpc.mockResolvedValueOnce({ data: null, error: { code } });
      await send().send(input).expect(status);
    }
  });
  let app:INestApplication;
  const receipt={appointment_id:P1,status:'cancelled',version:2,starts_at:'2026-11-02T09:00:00Z',ends_at:'2026-11-02T09:30:00Z',replayed:false};
  const payload={action:'cancel',expected_version:1};
  beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
  afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
  beforeEach(()=>{vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','true');vi.stubEnv('LOCAL_AGENDA_SETTINGS_GATE_KEY','synthetic-test');rpc.mockReset().mockResolvedValue({data:receipt,error:null});});
  const command=(token='manager',clinic=A)=>request(app.getHttpServer()).post(`/api/v1/appointments/${P1}/configured-commands`).set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic).set('Idempotency-Key',P2);
  it('denies unauthenticated, wrong role, inactive and foreign-clinic access before storage',async()=>{
    await request(app.getHttpServer()).post(`/api/v1/appointments/${P1}/configured-commands`).send(payload).expect(401);
    for(const role of ['dentist','assistant','inactive'])await command(role).send(payload).expect(403);
    await command('manager',B).send(payload).expect(403);expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects extra scope, invalid dates/version and missing request key',async()=>{
    await command().send({...payload,clinic_id:B}).expect(400);
    await command().query({clinic_id:B}).send(payload).expect(400);
    await command().send({...payload,expected_version:0}).expect(400);
    await command().send({action:'reschedule',expected_version:1,date:'2026-02-30',time:'25:00'}).expect(400);
    await command().unset('Idempotency-Key').send(payload).expect(400);expect(rpc).not.toHaveBeenCalled();
  });
  it('binds command to authorized clinic and returns a validated no-store receipt',async()=>{
    const result=await command('reception').send(payload).expect(201);expect(result.body).toEqual(receipt);expect(result.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('cancel_local_configured_appointment',{p_clinic_id:A,p_appointment_id:P1,p_expected_version:1,p_request_key:P2,p_gate_key:'synthetic-test'});
  });
  it('maps conflicts, missing objects, denied scope and invalid slots',async()=>{
    for(const [code,status] of [['SH409',409],['SH410',409],['SH404',404],['42501',403],['22023',400],['PT503',503]] as const){rpc.mockResolvedValueOnce({data:null,error:{code}});await command().send(payload).expect(status);}
  });
  it('rejects mismatched receipts and incomplete rescheduling',async()=>{
    for(const changed of [{appointment_id:P2},{version:4},{status:'confirmed'},{ends_at:'2026-11-02T08:00:00Z'}]){rpc.mockResolvedValueOnce({data:{...receipt,...changed},error:null});await command().send(payload).expect(503);}
    await command().send({action:'reschedule',expected_version:1,date:'2026-11-02',time:'09:00'}).expect(400);
  });
  it('routes a configured move with immutable revision and verifies exact returned times',async()=>{
    const move={action:'reschedule',expected_version:1,expected_revision:3,starts_at:'2026-11-02T14:00:00Z',ends_at:'2026-11-02T14:30:00Z'};
    rpc.mockResolvedValueOnce({data:{...receipt,status:'confirmed',starts_at:move.starts_at,ends_at:move.ends_at},error:null});
    await command('reception').send(move).expect(201);
    expect(rpc).toHaveBeenCalledWith('reschedule_local_configured_appointment',{p_clinic_id:A,p_appointment_id:P1,p_expected_version:1,p_request_key:P2,p_gate_key:'synthetic-test',p_expected_revision:3,p_starts_at:move.starts_at,p_ends_at:move.ends_at});
    rpc.mockResolvedValueOnce({data:{...receipt,status:'confirmed'},error:null});await command().send(move).expect(503);
    await command().send({...move,expected_revision:0}).expect(400);
  });
  it('protects rescheduling discovery and rejects invalid or foreign snapshots',async()=>{
    const url=`/api/v1/appointments/${P1}/configured-availability`;
    await request(app.getHttpServer()).get(url).query({date:'2026-11-02'}).expect(401);
    await request(app.getHttpServer()).get(url).set('Authorization','Bearer assistant').set('X-Clinic-Id',A).query({date:'2026-11-02'}).expect(403);
    await request(app.getHttpServer()).get(url).set('Authorization','Bearer manager').set('X-Clinic-Id',B).query({date:'2026-11-02'}).expect(403);
    await request(app.getHttpServer()).get(url).set('Authorization','Bearer manager').set('X-Clinic-Id',A).query({date:'2026-02-30'}).expect(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({data:{snapshot:{clinic_id:B}},error:null});await request(app.getHttpServer()).get(url).set('Authorization','Bearer manager').set('X-Clinic-Id',A).query({date:'2026-11-02'}).expect(503);
  });
  it('refuses hosted storage and disabled local writes',async()=>{
    vi.stubEnv('SUPABASE_URL','https://hosted.example.invalid');await command().send(payload).expect(503);
    vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','false');await command().send(payload).expect(503);expect(rpc).not.toHaveBeenCalled();
  });
});
