import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException,type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { OWNER_WORKLIST_REPOSITORY,type OwnerWorklistRepository } from '../../apps/dental-api/src/intake/domain/owner-worklist';
import { A,B,STAFF,P1,P2 } from '../fixtures';
const item={id:P1,clinic_id:A,owner_user_id:STAFF,display_name:'Synthetic Reminder',source:'phone' as const,status:'new' as const,follow_up_at:'2026-01-01T00:00:00Z',created_at:'2025-01-01T00:00:00Z'};
const detail={...item,contact_email:'synthetic@example.test',contact_phone:null};
const empty={items:[],truncated:false};
const projection={observed_at:'2026-10-26T00:00:00Z',overdue:{items:[item],truncated:false},upcoming:empty,undated:empty};
const identity:IdentityPort={verify:async token=>['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'reception':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[]};
describe('owner worklist HTTP boundary',()=>{
 let app:INestApplication;const list=vi.fn<OwnerWorklistRepository['list']>(),find=vi.fn<OwnerWorklistRepository['find']>();
 beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).overrideProvider(OWNER_WORKLIST_REPOSITORY).useValue({list,find}).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
 beforeEach(()=>{vi.stubEnv('ENABLE_INTAKE_COMMANDS','false');list.mockReset().mockResolvedValue(projection);find.mockReset().mockResolvedValue(detail);});
 const get=(path='owner-worklist',token='reception',clinic=A)=>request(app.getHttpServer()).get(`/api/v1/inquiries/${path}`).set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic);
 it('keeps static worklist route ahead of detail and permits active roles without write enablement',async()=>{
  for(const role of ['reception','manager','dentist']){const result=await get('owner-worklist',role).expect(200);expect(result.body).toEqual(projection);expect(result.headers['cache-control']).toBe('no-store');}
  expect(find).not.toHaveBeenCalled();const result=await get(P1).expect(200);expect(result.body).toEqual(detail);expect(result.headers['cache-control']).toBe('no-store');
 });
 it('denies missing/expired identity, role and foreign clinic before repository access',async()=>{
  const response=await request(app.getHttpServer()).get('/api/v1/inquiries/owner-worklist').expect(401);expect(response.headers['cache-control']).toBe('no-store');
  await get('owner-worklist','forged').expect(401);for(const role of ['assistant','inactive'])await get('owner-worklist',role).expect(403);await get('owner-worklist','reception',B).expect(403);expect(list).not.toHaveBeenCalled();expect(find).not.toHaveBeenCalled();
 });
 it('rejects all query parameters and malformed detail identifiers without echoing input',async()=>{
  for(const path of ['owner-worklist',P1]) {const result=await get(path).query({owner:'private-name'}).expect(400);expect(result.text).not.toContain('private-name');}
  await get('bad-uuid').expect(400);expect(list).not.toHaveBeenCalled();expect(find).not.toHaveBeenCalled();
 });
 it('makes absent, foreign and reassigned detail failures indistinguishable',async()=>{
  for(const reason of ['absent secret','foreign secret','reassigned secret']) {find.mockRejectedValueOnce(new NotFoundException(reason));const result=await get(P1).expect(404);expect(result.body).toEqual({statusCode:404,message:'Inquiry not found'});expect(result.headers['cache-control']).toBe('no-store');}
 });
 it('rejects private fields, foreign owners, invalid buckets/order and malformed detail successes',async()=>{
  for(const bad of [{...projection,overdue:{items:[{...item,contact_email:'private'}],truncated:false}},{...projection,overdue:{items:[{...item,owner_user_id:P2}],truncated:false}},{...projection,upcoming:projection.overdue,overdue:empty},{...projection,overdue:{items:[item,item],truncated:false}},{...projection,overdue:{items:[item],truncated:true}}]) {list.mockResolvedValueOnce(bad as never);expect((await get().expect(503)).text).not.toContain('private');}
  for(const bad of [{...detail,clinic_id:B},{...detail,id:P2},{...detail,owner_user_id:P2}]) {find.mockResolvedValueOnce(bad);await get(P1).expect(503);}
  list.mockRejectedValueOnce(new Error('provider private payload'));expect((await get().expect(503)).text).not.toContain('private');
 });
 it('returns explicit empty and truthful partial buckets',async()=>{
  list.mockResolvedValueOnce({...projection,overdue:empty});expect((await get().expect(200)).body.overdue).toEqual(empty);
  const items=Array.from({length:50},(_,i)=>({...item,id:`40000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));list.mockResolvedValueOnce({...projection,overdue:{items,truncated:true}});const result=await get().expect(200);expect(result.body.overdue.items).toHaveLength(50);expect(result.body.overdue.truncated).toBe(true);
 });
});
