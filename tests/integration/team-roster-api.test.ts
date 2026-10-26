import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { TEAM_ROSTER_REPOSITORY,type TeamRosterRepository } from '../../apps/dental-api/src/team/domain/roster';
import { A,B,STAFF,PATIENT,P1 } from '../fixtures';
const member={user_id:STAFF,clinic_id:A,display_name:'Synthetic Manager',roles:['manager' as const]};
const projection={observed_at:'2026-10-26T19:00:00Z',members:[member],truncated:false};
const identity:IdentityPort={verify:async token=>token==='patient'?PATIENT:['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>token==='patient'?[]:[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'manager':token) as StaffRole,active:token!=='inactive'}],patientLinks:async token=>token==='patient'?[{clinic_id:A,user_id:PATIENT,patient_id:P1,verified_at:'2026-10-26T00:00:00Z'}]:[]};
describe('team roster HTTP access and response boundary',()=>{
 let app:INestApplication;const list=vi.fn<TeamRosterRepository['list']>();
 beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).overrideProvider(TEAM_ROSTER_REPOSITORY).useValue({list}).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
 beforeEach(()=>{list.mockReset().mockResolvedValue(projection);vi.stubEnv('ENABLE_INTAKE_COMMANDS','false');});
 const get=(token='manager',clinic=A)=>request(app.getHttpServer()).get('/api/v1/team/roster').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic);
 it('permits manager/dentist, preserves DB order and emits no-store without write activation',async()=>{
  for(const role of ['manager','dentist']){const result=await get(role).expect(200);expect(result.body).toEqual(projection);expect(result.headers['cache-control']).toBe('no-store');}
  const members=[{...member,user_id:P1,display_name:'zeta'},member];list.mockResolvedValueOnce({...projection,members});expect((await get().expect(200)).body.members).toEqual(members);
 });
 it('denies absent/invalid identity, patient-only, inactive, reception/assistant and foreign clinic',async()=>{
  const response=await request(app.getHttpServer()).get('/api/v1/team/roster').expect(401);expect(response.headers['cache-control']).toBe('no-store');await get('expired').expect(401);
  for(const role of ['reception','assistant','patient','inactive'])expect((await get(role).expect(403)).headers['cache-control']).toBe('no-store');await get('manager',B).expect(403);expect(list).not.toHaveBeenCalled();
 });
 it('rejects query parameters and every body including empty JSON and raw text before provider',async()=>{
  await get().query({clinic_id:B}).expect(400);await get().send({}).expect(400);await get().send({role:'dentist'}).expect(400);
  const result=await get().set('Content-Type','text/plain').send('private name').expect(400);expect(result.text).not.toContain('private name');expect(list).not.toHaveBeenCalled();
 });
 it('fails closed for foreign members, duplicate IDs, noncanonical roles and extra fields',async()=>{
  for(const members of [[{...member,clinic_id:B}],[member,member],[{...member,roles:['manager','assistant']}],[{...member,roles:['manager','manager']}],[{...member,email:'private@example.test'}]]) {list.mockResolvedValueOnce({...projection,members} as never);const result=await get().expect(503);expect(result.headers['cache-control']).toBe('no-store');expect(result.text).not.toContain('private');}
  list.mockRejectedValueOnce(new Error('private provider name'));expect((await get().expect(503)).body).toEqual({statusCode:503,message:'Team roster unavailable'});
 });
 it('shows explicit empty and100+ partial results without inventing a total',async()=>{
  list.mockResolvedValueOnce({...projection,members:[]});expect((await get().expect(200)).body.members).toEqual([]);
  const members=Array.from({length:100},(_,i)=>({...member,user_id:`30000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));list.mockResolvedValueOnce({...projection,members,truncated:true});const result=await get().expect(200);expect(result.body.members).toHaveLength(100);expect(result.body.truncated).toBe(true);expect(result.body.total).toBeUndefined();
 });
 it('adds no invitation, assignment or mutation endpoint',async()=>{
  await request(app.getHttpServer()).post('/api/v1/team/roster').send({}).expect(404);await request(app.getHttpServer()).post('/api/v1/team/invitations').send({}).expect(404);
 });
});
