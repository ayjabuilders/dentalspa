import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ForbiddenException,NotFoundException,ServiceUnavailableException,type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { FOLLOW_UP_REPOSITORY,type FollowUpRepository } from '../../apps/dental-api/src/intake/domain/follow-up';
import { A,B,STAFF,P1,P2,P3 } from '../fixtures';
const input={kind:'contact_attempt',channel:'phone'} as const;
const item={...input,id:P2,clinic_id:A,inquiry_id:P1,actor_user_id:STAFF,recorded_at:'2026-10-26T18:00:00Z',event_version:1} as const;
const identity:IdentityPort={verify:async token=>['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'reception':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[]};
describe('owner follow-up HTTP boundary',()=>{
 let app:INestApplication;const list=vi.fn<FollowUpRepository['list']>(),record=vi.fn<FollowUpRepository['record']>();
 beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).overrideProvider(FOLLOW_UP_REPOSITORY).useValue({list,record}).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
 beforeEach(()=>{vi.stubEnv('ENABLE_INTAKE_COMMANDS','true');list.mockReset().mockResolvedValue({items:[item],truncated:false});record.mockReset().mockResolvedValue({item:item,replayed:false});});
 const get=()=>request(app.getHttpServer()).get(`/api/v1/inquiries/${P1}/follow-ups`).set('Authorization','Bearer reception').set('X-Clinic-Id',A);
 const post=(token='reception')=>request(app.getHttpServer()).post(`/api/v1/inquiries/${P1}/follow-ups`).set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',A).set('Idempotency-Key',P3);
 it('returns201 new,200 immutable replay, and no-store history for allowed roles',async()=>{
  for(const role of ['reception','manager','dentist']) {const response=await post(role).send(input).expect(201);expect(response.headers['cache-control']).toBe('no-store');expect(response.body.item).toEqual(item);}
  record.mockResolvedValueOnce({item:item,replayed:true});expect((await post().send(input).expect(200)).body.replayed).toBe(true);
  const response=await get().expect(200);expect(response.headers['cache-control']).toBe('no-store');expect(response.body.items).toEqual([item]);
 });
 it('disables writes by default without blocking authorized reads; distinguishes provider failure',async()=>{
  vi.stubEnv('ENABLE_INTAKE_COMMANDS',undefined);expect((await post().send(input).expect(503)).body.code).toBe('intake_disabled');await get().expect(200);expect(record).not.toHaveBeenCalled();
  vi.stubEnv('ENABLE_INTAKE_COMMANDS','true');record.mockRejectedValueOnce(new ServiceUnavailableException('private database detail'));const response=await post().send(input).expect(503);expect(response.body.code).toBeUndefined();expect(response.text).not.toContain('private');
 });
 it('denies missing identity, disallowed roles and database owner/foreign failures with no-store',async()=>{
  const absent=await request(app.getHttpServer()).get(`/api/v1/inquiries/${P1}/follow-ups`).expect(401);expect(absent.headers['cache-control']).toBe('no-store');
  for(const role of ['assistant','inactive']) await post(role).send(input).expect(403);
  record.mockRejectedValueOnce(new ForbiddenException('private owner'));await post().send(input).expect(403);list.mockRejectedValueOnce(new NotFoundException('private foreign'));expect((await get().expect(404)).text).not.toContain('private');
 });
 it('rejects query parameters, extra content, invalid identifiers and absent keys before provider access',async()=>{
  for(const body of [{...input,note:'secret'},{...input,recorded_at:item.recorded_at},{...input,channel:'whatsapp'},{...input,actor_user_id:STAFF},{...input,kind:'unknown'}]) await post().send(body).expect(400);
  await post().query({q:'secret'}).send(input).expect(400);await get().query({limit:100}).expect(400);await post().unset('Idempotency-Key').send(input).expect(400);
  await request(app.getHttpServer()).get('/api/v1/inquiries/invalid/follow-ups').set('Authorization','Bearer reception').set('X-Clinic-Id',A).expect(400);expect(record).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();
 });
 it('fails closed on malformed, foreign and target-mismatched successful responses',async()=>{
  for(const wrong of [{...item,clinic_id:B},{...item,inquiry_id:P3},{...item,actor_user_id:P3},{...item,channel:'email'},{...item,note:'secret'}]) {record.mockResolvedValueOnce({item:wrong as never,replayed:false});const response=await post().send(input).expect(503);expect(response.text).not.toContain('secret');}
  list.mockResolvedValueOnce({items:[{...item,inquiry_id:P3} as never],truncated:false});await get().expect(503);
  record.mockRejectedValueOnce(new Error('unhandled private details'));expect((await post().send(input).expect(503)).text).not.toContain('private');
 });
 it('exposes no edit or delete route and preserves explicit empty/partial history',async()=>{
  list.mockResolvedValueOnce({items:[],truncated:false});expect((await get().expect(200)).body).toEqual({items:[],truncated:false});
  list.mockResolvedValueOnce({items:[item],truncated:true});expect((await get().expect(200)).body.truncated).toBe(true);
  await request(app.getHttpServer()).patch(`/api/v1/inquiries/${P1}/follow-ups/${P2}`).send(input).expect(404);await request(app.getHttpServer()).delete(`/api/v1/inquiries/${P1}/follow-ups/${P2}`).expect(404);
 });
});
