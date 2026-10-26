import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { TEAM_ACTIVITY_REPOSITORY,type TeamActivityRepository } from '../../apps/dental-api/src/team/domain/activity';
import { A,B,STAFF,PATIENT,P1 } from '../fixtures';
const item={kind:'inquiry_created' as const,actor_display_name:'Synthetic Manager',occurred_at:'2026-10-26T19:00:00Z'};
const projection={observed_at:'2026-10-26T19:00:00Z',items:[item],truncated:false};
const identity:IdentityPort={verify:async token=>token==='patient'?PATIENT:['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>token==='patient'?[]:[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'manager':token) as StaffRole,active:token!=='inactive'}],patientLinks:async token=>token==='patient'?[{clinic_id:A,user_id:PATIENT,patient_id:P1,verified_at:'2026-10-26T00:00:00Z'}]:[]};
describe('team activity HTTP access and response boundary',()=>{
 let app:INestApplication;const list=vi.fn<TeamActivityRepository['list']>();
 beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).overrideProvider(TEAM_ACTIVITY_REPOSITORY).useValue({list}).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
 beforeEach(()=>{list.mockReset().mockResolvedValue(projection);vi.stubEnv('ENABLE_INTAKE_COMMANDS','false');});
 const get=(token='manager',clinic=A)=>request(app.getHttpServer()).get('/api/v1/team/activity').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic);

 it('permits manager and preserves minimal ordered response without activation',async()=>{const result=await get().expect(200);expect(result.body).toEqual(projection);expect(result.headers['cache-control']).toBe('no-store');});
 it('denies missing/expired identity, non-manager, inactive and cross-clinic without provider',async()=>{expect((await request(app.getHttpServer()).get('/api/v1/team/activity').expect(401)).headers['cache-control']).toBe('no-store');await get('expired').expect(401);for(const role of ['dentist','reception','assistant','patient','inactive'])expect((await get(role).expect(403)).headers['cache-control']).toBe('no-store');await get('manager',B).expect(403);expect(list).not.toHaveBeenCalled();});
 it('rejects all query and body input before provider without echo',async()=>{await get().query({clinic_id:B}).expect(400);await get().send({}).expect(400);await get().send({role:'manager'}).expect(400);expect((await get().set('Content-Type','text/plain').send('private content').expect(400)).text).not.toContain('private');expect(list).not.toHaveBeenCalled();});
 it('sanitizes unknown kinds, identifiers, malformed time, ascending microseconds and invalid partial results',async()=>{
  for(const payload of [{...projection,items:[{...item,kind:'unknown'}]},{...projection,items:[{...item,actor_ref:STAFF}]},{...projection,items:[{...item,occurred_at:'invalid'}]},{...projection,items:[{...item,occurred_at:'2026-10-26T19:00:00.000001Z'},{...item,occurred_at:'2026-10-26T19:00:00.000002Z'}]},{...projection,truncated:true},{...projection,total:10}]){list.mockResolvedValueOnce(payload as never);const result=await get().expect(503);expect(result.headers['cache-control']).toBe('no-store');expect(result.body).toEqual({statusCode:503,message:'Team activity unavailable'});}
  list.mockRejectedValueOnce(new Error('private provider content'));expect((await get().expect(503)).text).not.toContain('private');
 });
 it('preserves null name, empty and explicit50+ partial without total or identifiers',async()=>{list.mockResolvedValueOnce({...projection,items:[{...item,actor_display_name:null}]});expect((await get().expect(200)).body.items[0].actor_display_name).toBeNull();list.mockResolvedValueOnce({...projection,items:[]});expect((await get().expect(200)).body.items).toEqual([]);list.mockResolvedValueOnce({...projection,items:Array.from({length:50},()=>item),truncated:true});const result=await get().expect(200);expect(result.body.items).toHaveLength(50);expect(result.body.truncated).toBe(true);expect(result.body.total).toBeUndefined();});
 it('adds no mutation route',async()=>{await request(app.getHttpServer()).post('/api/v1/team/activity').send({}).expect(404);});
});
