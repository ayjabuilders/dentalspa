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
describe('local appointment command HTTP boundary',()=>{
  let app:INestApplication;
  const receipt={appointment_id:P1,status:'cancelled',version:2,starts_at:'2026-11-02T09:00:00Z',ends_at:'2026-11-02T09:45:00Z',replayed:false};
  const payload={action:'cancel',expected_version:1};
  beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
  afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
  beforeEach(()=>{vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_DEMO_BOOKING_CONFIRMATIONS','true');vi.stubEnv('DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY','synthetic-test');rpc.mockReset().mockResolvedValue({data:receipt,error:null});});
  const command=(token='manager',clinic=A)=>request(app.getHttpServer()).post(`/api/v1/appointments/${P1}/commands`).set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic).set('Idempotency-Key',P2);
  it('denies unauthenticated, wrong role, inactive and foreign-clinic access before storage',async()=>{
    await request(app.getHttpServer()).post(`/api/v1/appointments/${P1}/commands`).send(payload).expect(401);
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
    expect(rpc).toHaveBeenCalledWith('manage_local_demo_appointment',{p_clinic_id:A,p_appointment_id:P1,p_action:'cancel',p_date:null,p_time:null,p_expected_version:1,p_request_key:P2,p_gate_key:'synthetic-test'});
  });
  it('maps conflicts, missing objects, denied scope and invalid slots',async()=>{
    for(const [code,status] of [['SH409',409],['SH410',409],['SH404',404],['42501',403],['22023',400],['PT503',503]] as const){rpc.mockResolvedValueOnce({data:null,error:{code}});await command().send(payload).expect(status);}
  });
  it('rejects mismatched receipts and validates moved Casablanca wall time',async()=>{
    for(const changed of [{appointment_id:P2},{version:4},{status:'confirmed'},{ends_at:'2026-11-02T10:00:00Z'}]){rpc.mockResolvedValueOnce({data:{...receipt,...changed},error:null});await command().send(payload).expect(503);}
    const move={action:'reschedule',expected_version:1,date:'2026-11-02',time:'09:00'};
    rpc.mockResolvedValueOnce({data:{...receipt,status:'confirmed'},error:null});await command().send(move).expect(201);
    rpc.mockResolvedValueOnce({data:{...receipt,status:'confirmed'},error:null});await command().send({...move,time:'10:00'}).expect(503);
  });
  it('refuses hosted storage and disabled local writes',async()=>{
    vi.stubEnv('SUPABASE_URL','https://hosted.example.invalid');await command().send(payload).expect(503);
    vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_DEMO_BOOKING_CONFIRMATIONS','false');await command().send(payload).expect(503);expect(rpc).not.toHaveBeenCalled();
  });
});
