import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { PATIENT_REPOSITORY,type PatientRepository } from '../../apps/dental-api/src/patients/domain/patient';
import { A,B,STAFF,PATIENT,P1,P2 } from '../fixtures';
const patient={id:P1,clinic_id:A,reference:'R-001',display_name:'Alice'};
const item={...patient,match_basis:'name_prefix' as const};
const input={mode:'name_prefix',query:' Al '};
const identity:IdentityPort={
  verify:async token=>token==='patient'?PATIENT:['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,
  memberships:async token=>token==='patient'?[]:[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'reception':token) as StaffRole,active:token!=='inactive'}],
  patientLinks:async token=>token==='patient'?[{clinic_id:A,user_id:PATIENT,patient_id:P1,verified_at:'2026-10-26T12:00:00Z'}]:[],
};
describe('read-only patient lookup HTTP boundary',()=>{
  let app:INestApplication;
  const lookup=vi.fn<PatientRepository['lookup']>();
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity)
      .overrideProvider(PATIENT_REPOSITORY).useValue({lookup,list:async()=>[patient],find:async(_actor:unknown,id:string)=>id===P1?patient:null}).compile();
    app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();
  });
  afterAll(async()=>{await app?.close();});
  beforeEach(()=>{lookup.mockReset().mockResolvedValue({items:[item],truncated:false});});
  const post=(token='reception',clinic=A)=>request(app.getHttpServer()).post('/api/v1/patients/lookup').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic);
  it('accepts active roles, trims input and returns 200 with no-store',async()=>{
    for(const role of ['reception','manager','dentist']){
      const response=await post(role).send(input).expect(200);expect(response.headers['cache-control']).toBe('no-store');expect(response.body).toEqual({items:[item],truncated:false});
    }
    expect(lookup.mock.calls[0]?.[1]).toEqual({mode:'name_prefix',query:'Al'});
  });
  it('denies missing/forged tokens and unauthorized or foreign scope before repository access',async()=>{
    await request(app.getHttpServer()).post('/api/v1/patients/lookup').send(input).expect(401);await post('forged').send(input).expect(401);
    for(const role of ['assistant','patient','inactive'])await post(role).send(input).expect(403);
    for(const clinic of [B,'invalid',''])await post('reception',clinic).send(input).expect(403);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('rejects query strings, unknown fields and invalid modes/bounds without echo',async()=>{
    for(const body of [{...input,clinic_id:B},{...input,limit:100},{mode:'regex',query:'private-search'},{mode:'name_prefix',query:'A'},{mode:'reference_exact',query:''},{...input,query:'x'.repeat(121)}]){
      const response=await post().send(body).expect(400);expect(response.text).not.toContain('private-search');
    }
    await post().query({query:'private-search'}).send(input).expect(400);expect(lookup).not.toHaveBeenCalled();
  });
  it('returns empty/truncated results accurately without echoing the query',async()=>{
    lookup.mockResolvedValueOnce({items:[],truncated:false});expect((await post().send(input).expect(200)).body).toEqual({items:[],truncated:false});
    lookup.mockResolvedValueOnce({items:[item],truncated:true});const response=await post().send(input).expect(200);expect(response.body.truncated).toBe(true);expect(response.body).not.toHaveProperty('query');
  });
  it('rejects foreign rows and wrong match-basis from a privileged/faulty adapter',async()=>{
    lookup.mockResolvedValueOnce({items:[{...item,clinic_id:B}],truncated:false});const foreign=await post().send(input).expect(503);expect(foreign.text).not.toContain('Alice');
    lookup.mockResolvedValueOnce({items:[{...item,match_basis:'reference_exact'}],truncated:false});await post().send(input).expect(503);
    lookup.mockResolvedValueOnce({items:[{...item,display_name:'Unrelated patient'}],truncated:false});await post().send(input).expect(503);
  });
  it('preserves both existing GET contracts, including assistant minimum reads',async()=>{
    expect((await request(app.getHttpServer()).get('/api/v1/patients').set('Authorization','Bearer assistant').set('X-Clinic-Id',A).expect(200)).body).toEqual([patient]);
    expect((await request(app.getHttpServer()).get(`/api/v1/patients/${P1}`).set('Authorization','Bearer reception').set('X-Clinic-Id',A).expect(200)).body).toEqual(patient);
    await request(app.getHttpServer()).get(`/api/v1/patients/${P2}`).set('Authorization','Bearer reception').set('X-Clinic-Id',A).expect(404);
  });
  it('does not expose a mutating patient command or create an inquiry selection',async()=>{
    await request(app.getHttpServer()).post('/api/v1/patients').send(input).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/inquiries/${P1}/patient-selection`).send({patient_id:P1}).expect(404);
  });
});
