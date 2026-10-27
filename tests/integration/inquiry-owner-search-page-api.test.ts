import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { OWNER_SEARCH_PAGE_REPOSITORY,type OwnerSearchPageRepository } from '../../apps/dental-api/src/intake/domain/owner-search-page';
import { A,B,STAFF,P1,P2 } from '../fixtures';
const item={id:P1,display_name:'Synthetic Inquiry',source:'phone' as const,status:'new' as const,follow_up_at:null,created_at:'2026-10-26T20:00:00.123456Z'};
const result={clinic_id:A,owner_user_id:STAFF,name:'Synthetic',before:null,next_before:null,items:[item],truncated:false};
const identity:IdentityPort={verify:async token=>['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'reception':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[]};
describe('owner search HTTP privacy and read-only behavior',()=>{
 let app:INestApplication;const search=vi.fn<OwnerSearchPageRepository['search']>();
 beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).overrideProvider(OWNER_SEARCH_PAGE_REPOSITORY).useValue({search}).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
 beforeEach(()=>{vi.stubEnv('ENABLE_INTAKE_COMMANDS','false');search.mockReset().mockResolvedValue(result);});
 const post=(token='reception',clinic=A)=>request(app.getHttpServer()).post('/api/v1/inquiries/owner-search-page').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic);
 it('permits all allowed roles with writes disabled and no key, using200/no-store',async()=>{for(const role of ['reception','manager','dentist']){const response=await post(role).send({before:null,name:'Synthetic'}).expect(200);expect(response.body).toEqual(result);expect(response.headers['cache-control']).toBe('no-store');}search.mockResolvedValueOnce({...result,name:'Absent',items:[]});expect((await post().send({before:null,name:'Absent'}).expect(200)).body.items).toEqual([]);});
 it('denies absent identity, inactive/assistant and cross-clinic without provider',async()=>{expect((await post('expired').send({before:null,name:'Synthetic'}).expect(401)).headers['cache-control']).toBe('no-store');for(const role of ['inactive','assistant'])await post(role).send({before:null,name:'Synthetic'}).expect(403);await post('reception',B).send({before:null,name:'Synthetic'}).expect(403);expect(search).not.toHaveBeenCalled();});
 it('rejects noncanonical input and query without echoing request content',async()=>{await post().query({owner:STAFF}).send({before:null,name:'Synthetic'}).expect(400);for(const body of [{},{before:null,name:'S'},{before:null,name:'😀'},{before:null,name:'😀'.repeat(81)},{before:null,name:' Synthetic '},{before:null,name:'Sy\nnthetic'},{before:null,name:'Synthetic',contact_email:'private@example.test'}]){const response=await post().send(body).expect(400);expect(response.text).not.toContain('private');expect(response.headers['cache-control']).toBe('no-store');}expect(search).not.toHaveBeenCalled();});
 it('rejects false scope echoes, private fields, duplicates, order errors and malformed partials',async()=>{for(const value of [{...result,clinic_id:B},{...result,owner_user_id:P2},{...result,items:[{...item,contact_phone:'private'}]},{...result,items:[item,item]},{...result,items:[item,{...item,id:P2,created_at:'2026-10-26T20:00:00.123457Z'}]},{...result,truncated:true}]){search.mockResolvedValueOnce(value as never);expect((await post().send({before:null,name:'Synthetic'}).expect(503)).body).toEqual({statusCode:503,message:'Owner search unavailable'});}search.mockRejectedValueOnce(new Error('private provider query'));expect((await post().send({before:null,name:'Synthetic'}).expect(503)).text).not.toContain('private');});
 it('accepts50 distinct partial results without exact total',async()=>{const items=Array.from({length:50},(_,i)=>({...item,id:`70000000-0000-4000-8000-${String(50-i).padStart(12,'0')}`}));search.mockResolvedValueOnce({...result,items,truncated:true,next_before:{created_at:item.created_at,inquiry_id:items.at(-1)!.id}});const response=await post().send({before:null,name:'Synthetic'}).expect(200);expect(response.body.items).toHaveLength(50);expect(response.body.truncated).toBe(true);expect(response.body.total).toBeUndefined();});
 it('rejects incorrect or missing exact query/bound echoes and out-of-bound items',async()=>{
  for(const value of [{...result,name:'Different'},{...result,name:undefined},{...result,before:{created_at:item.created_at,inquiry_id:P2}}]){
   search.mockResolvedValueOnce(value as never);await post().send({name:'Synthetic',before:null}).expect(503);
  }
  const before={created_at:item.created_at,inquiry_id:P1};
  search.mockResolvedValueOnce({...result,before} as never);await post().send({name:'Synthetic',before}).expect(503);
  search.mockResolvedValueOnce({...result,before:{...before,created_at:'2026-10-26T21:00:00.123456+01:00'},items:[]} as never);
  await post().send({name:'Synthetic',before}).expect(503);
  search.mockResolvedValueOnce({...result,before,items:[]} as never);
  expect((await post().send({name:'Synthetic',before}).expect(200)).body.before).toEqual(before);
 });
 it('rejects missing, coercible or extra cursor fields before repository',async()=>{
  for(const body of [{name:'Synthetic'},{name:'Synthetic',before:{}},{name:'Synthetic',before:{created_at:item.created_at,inquiry_id:P1,limit:1}},{name:'Synthetic',before:{created_at:'2026-10-26T20:00:00.0000001Z',inquiry_id:P1}}])await post().send(body).expect(400);
  expect(search).not.toHaveBeenCalled();
 });
});
