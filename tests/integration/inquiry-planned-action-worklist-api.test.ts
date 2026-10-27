import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { PLANNED_ACTION_WORKLIST_REPOSITORY,type PlannedActionWorklistRepository } from '../../apps/dental-api/src/intake/domain/planned-action-worklist';
import { A,B,STAFF,PATIENT,P1,P2 } from '../fixtures';
const item={inquiry_id:P1,display_name:'Synthetic Inquiry',planned_action:'review_inquiry' as const,vocabulary_version:1 as const,revision:1,updated_at:'2026-10-26T20:00:00.123456Z'};
const result={schema_version:1 as const,clinic_id:A,owner_user_id:STAFF,observed_at:'2026-10-27T00:00:00Z',items:[item],truncated:false};
const identity:IdentityPort={verify:async token=>token==='patient'?PATIENT:['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>token==='patient'?[]:[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'reception':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[]};
describe('planned action worklist HTTP boundary',()=>{
 let app:INestApplication;const list=vi.fn<PlannedActionWorklistRepository['list']>();
 beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).overrideProvider(PLANNED_ACTION_WORKLIST_REPOSITORY).useValue({list}).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
 afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
 beforeEach(()=>{vi.stubEnv('ENABLE_INTAKE_COMMANDS','false');list.mockReset().mockResolvedValue(result);});
 const read=(token='reception',clinic=A)=>request(app.getHttpServer()).get('/api/v1/inquiries/owner-planned-actions').set('Authorization','Bearer '+token).set('X-Clinic-Id',clinic);
 it('uses static route before detail and permits allowed owners with writes off, no key',async()=>{for(const role of ['reception','manager','dentist']){const response=await read(role).expect(200);expect(response.body).toEqual(result);expect(response.headers['cache-control']).toBe('no-store');}list.mockResolvedValueOnce({...result,items:[]});expect((await read().expect(200)).body.items).toEqual([]);});
 it('denies missing identity, patient, inactive, assistant and unauthorized clinic',async()=>{expect((await read('expired').expect(401)).headers['cache-control']).toBe('no-store');for(const role of ['patient','inactive','assistant'])await read(role).expect(403);await read('reception',B).expect(403);expect(list).not.toHaveBeenCalled();});
 it('rejects every query without leaking private input',async()=>{const response=await read().query({owner:STAFF,private:'private@example.test'}).expect(400);expect(response.text).not.toContain('private');expect(response.headers['cache-control']).toBe('no-store');expect(list).not.toHaveBeenCalled();});
 it('fails closed on missing/wrong echoes and provider failures',async()=>{for(const patch of [{clinic_id:B},{owner_user_id:P2},{clinic_id:undefined},{owner_user_id:undefined}]){list.mockResolvedValueOnce({...result,...patch} as never);await read().expect(503);}list.mockRejectedValueOnce(new Error('private connection token'));const response=await read().expect(503);expect(response.text).not.toContain('private');expect(response.body.code).toBeUndefined();expect(response.headers['cache-control']).toBe('no-store');});
 it('rejects trusted malformed, private, duplicate, out-of-order and false-truncation output',async()=>{
  const upper={...item,inquiry_id:'abcdefab-abcd-4abc-8abc-abcdefabcdef'};
  const badItems=[[{...item,planned_action:null}],[{...item,revision:0}],[{...item,vocabulary_version:2}],[{...item,updated_at:'bad'}],[{...item,contact_email:'private'}],[upper,{...upper,inquiry_id:upper.inquiry_id.toUpperCase()}],[item,{...item,inquiry_id:P2,updated_at:'2026-10-26T20:00:00.123457Z'}]];
  for(const items of badItems){list.mockResolvedValueOnce({...result,items} as never);await read().expect(503);}
  list.mockResolvedValueOnce({...result,truncated:true});await read().expect(503);
 });
});
