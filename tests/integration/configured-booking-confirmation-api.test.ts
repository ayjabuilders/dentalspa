import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {AppModule} from '../../apps/dental-api/src/app.module';
import {IDENTITY,type IdentityPort,type StaffRole} from '../../apps/dental-api/src/identity/domain/access';
import {A,B,STAFF,P1,P2} from '../fixtures';
const {rpc,scoped}=vi.hoisted(()=>({rpc:vi.fn(),scoped:vi.fn()}));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',async original=>({...await original<object>(),scopedClient:(token:unknown)=>{scoped(token);return {rpc};}}));
const identity:IdentityPort={verify:async token=>['manager','reception','dentist','assistant','inactive'].includes(token)?STAFF:null,
  memberships:async token=>[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'manager':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[]};
describe('configured confirmation HTTP boundary',()=>{
  let app:INestApplication;
  const body={expected_revision:3};
  const receipt={request_id:P1,appointment_id:P2,status:'confirmed',version:1,starts_at:'2026-11-02T09:00:00Z',ends_at:'2026-11-02T09:30:00Z',replayed:false};
  beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
  afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
  beforeEach(()=>{vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','true');vi.stubEnv('LOCAL_AGENDA_SETTINGS_GATE_KEY','synthetic-test');rpc.mockReset().mockResolvedValue({data:receipt,error:null});scoped.mockReset();});
  const command=(token='manager',clinic=A)=>request(app.getHttpServer()).post(`/api/v1/booking-requests/configured/${P1}/confirm`).set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic).set('Idempotency-Key',P2);
  it('denies anonymous, inactive, wrong role and foreign scope before storage',async()=>{
    await request(app.getHttpServer()).post(`/api/v1/booking-requests/configured/${P1}/confirm`).send(body).expect(401);
    for(const role of ['inactive','dentist','assistant'])await command(role).send(body).expect(403);
    await command('manager',B).send(body).expect(403);expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects caller-supplied scope, malformed commands and query parameters',async()=>{
    for(const invalid of [{...body,clinic_id:B},{...body,patient_id:P2},{...body,expected_revision:0},{...body,expected_revision:'3'},{}])await command().send(invalid).expect(400);
    await command().query({clinic_id:B}).send(body).expect(400);
    await command().unset('Idempotency-Key').send(body).expect(400);
    await command().set('Idempotency-Key','invalid').send(body).expect(400);expect(rpc).not.toHaveBeenCalled();
  });
  it('binds the RPC to the authenticated tenant/token and validates immutable replay',async()=>{
    const result=await command('reception').send(body).expect(201);expect(result.body).toEqual(receipt);expect(result.headers['cache-control']).toBe('no-store');expect(scoped).toHaveBeenCalledWith('reception');
    expect(rpc).toHaveBeenCalledWith('confirm_local_configured_booking_request',{p_clinic_id:A,p_request_id:P1,p_command_key:P2,p_expected_revision:3,p_gate_key:'synthetic-test'});
    rpc.mockResolvedValueOnce({data:{...receipt,replayed:true},error:null});expect((await command().send(body).expect(201)).body.replayed).toBe(true);
  });
  it('maps domain errors without exposing database internals',async()=>{
    for(const [code,status] of [['42501',403],['SH404',404],['SH409',409],['SH410',409],['22023',400],['PT503',503],['XX000',503]] as const){
      rpc.mockResolvedValueOnce({data:null,error:{code,message:'private-secret-error'}});const result=await command().send(body).expect(status);expect(JSON.stringify(result.body)).not.toContain('private-secret-error');
    }
  });
  it('rejects wrong-request, extra-field, malformed and reversed-time receipts',async()=>{
    for(const changed of [{request_id:P2},{appointment_id:'invalid'},{version:2},{status:'request_received'},{starts_at:receipt.ends_at},{private_contact:'secret'}]){
      rpc.mockResolvedValueOnce({data:{...receipt,...changed},error:null});await command().send(body).expect(503);
    }
    rpc.mockRejectedValueOnce(new Error('private-network-error'));const result=await command().send(body).expect(503);expect(JSON.stringify(result.body)).not.toContain('private-network-error');
  });
  it('fails closed for hosted storage, disabled or missing capability',async()=>{
    vi.stubEnv('SUPABASE_URL','https://hosted.example.invalid');await command().send(body).expect(503);
    vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','false');await command().send(body).expect(503);
    vi.stubEnv('ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS','true');vi.stubEnv('LOCAL_AGENDA_SETTINGS_GATE_KEY','');await command().send(body).expect(503);expect(rpc).not.toHaveBeenCalled();
  });
});
