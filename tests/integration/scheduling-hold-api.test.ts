import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { SCHEDULING_REPOSITORY,type SchedulingRepository } from '../../apps/dental-api/src/scheduling/scheduling.repository';
import { SchedulingError } from '../../apps/dental-api/src/scheduling/errors';
import { A,B,STAFF,P1,P2,P3 } from '../fixtures';
const input={provider_resource_id:P1,chair_resource_id:P2,starts_at:'2026-10-28T10:00:00.000Z',ends_at:'2026-10-28T10:30:00.000Z',display_timezone:'Africa/Casablanca'};
const item={...input,id:P3,clinic_id:A,status:'held',expires_at:'2026-10-26T12:05:00.000Z',created_at:'2026-10-26T12:00:00.000Z',version:1};
const receipt={item,replayed:false,observed_at:'2026-10-26T12:00:00.000Z'};
const identity:IdentityPort={verify:async token=>['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'reception':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[]};
describe('scheduling HTTP boundary',()=>{
 let app:INestApplication;const call=vi.fn<SchedulingRepository['call']>();
 beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).overrideProvider(SCHEDULING_REPOSITORY).useValue({call}).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
 beforeEach(()=>{vi.stubEnv('ENABLE_SCHEDULING_HOLDS','true');call.mockReset().mockResolvedValue(receipt);});
 const create=(token='reception')=>request(app.getHttpServer()).post('/api/v1/scheduling/holds').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',A).set('Idempotency-Key',P1);
 const read=()=>request(app.getHttpServer()).get('/api/v1/scheduling/resources').set('Authorization','Bearer reception').set('X-Clinic-Id',A);
 it('is disabled by default for reads and writes, with stable no-store errors',async()=>{
  vi.stubEnv('ENABLE_SCHEDULING_HOLDS',undefined);
  for(const response of [await read().expect(503),await create().send(input).expect(503)]) {expect(response.body.code).toBe('scheduling_disabled');expect(response.headers['cache-control']).toBe('no-store');}
  expect(call).not.toHaveBeenCalled();
 });
 it('returns no-store stable guard failures and denies assistant without changing other modules',async()=>{
  const absent=await request(app.getHttpServer()).post('/api/v1/scheduling/holds').send(input).expect(401);expect(absent.body.code).toBe('unauthenticated');expect(absent.headers['cache-control']).toBe('no-store');
  for(const token of ['assistant','inactive']) expect((await create(token).send(input).expect(403)).body.code).toBe('forbidden');
  expect(call).not.toHaveBeenCalled();
 });
 it('accepts permitted roles, returns201 fresh and200 replay without renewing timestamps',async()=>{
  for(const role of ['reception','manager','dentist']) {const response=await create(role).send(input).expect(201);expect(response.body).toEqual(receipt);expect(response.headers['cache-control']).toBe('no-store');}
  call.mockResolvedValue({...receipt,replayed:true});expect((await create().send(input).expect(200)).body.item.expires_at).toBe(item.expires_at);
 });
 it('rejects query, unknown fields, body keys, missing key and malformed release before provider',async()=>{
  for(const body of [{...input,patient_id:P3},{...input,clinic_id:A},{...input,idempotency_key:P1},{...input,starts_at:'not-a-date'}]) expect((await create().send(body).expect(400)).body.code).toBe('invalid_request');
  await create().query({patient:'secret'}).send(input).expect(400);await create().unset('Idempotency-Key').send(input).expect(400);
  await request(app.getHttpServer()).post(`/api/v1/scheduling/holds/${P3}/release`).set('Authorization','Bearer reception').set('X-Clinic-Id',A).set('Idempotency-Key',P1).send({patient_id:P1}).expect(400);
  expect(call).not.toHaveBeenCalled();
 });
 it('sanitizes provider exceptions, foreign results and malformed responses',async()=>{
  for(const response of [{...receipt,item:{...item,clinic_id:B}},{...receipt,item:{...item,patient_id:P1}},{...receipt,item:{...item,chair_resource_id:P1}}]) {call.mockResolvedValueOnce(response);expect((await create().send(input).expect(500)).body).toEqual({statusCode:500,code:'internal_error',message:'internal_error'});}
  call.mockRejectedValueOnce(new Error('private database values'));expect((await create().send(input).expect(500)).text).not.toContain('private');
  call.mockRejectedValueOnce(new SchedulingError('resource_conflict'));expect((await create().send(input).expect(409)).body.code).toBe('resource_conflict');
 });
 it('reads current projection and accepts only released release receipts',async()=>{
  call.mockResolvedValueOnce({item:{...item,status:'expired'},observed_at:receipt.observed_at});
  const result=await request(app.getHttpServer()).get(`/api/v1/scheduling/holds/${P3}`).set('Authorization','Bearer reception').set('X-Clinic-Id',A).expect(200);expect(result.body.item.status).toBe('expired');
  call.mockResolvedValueOnce({...receipt,item:{...item,status:'released'},transitioned:true});
  const released=await request(app.getHttpServer()).post(`/api/v1/scheduling/holds/${P3}/release`).set('Authorization','Bearer reception').set('X-Clinic-Id',A).set('Idempotency-Key',P2).send({}).expect(200);expect(released.body.transitioned).toBe(true);
 });
});
