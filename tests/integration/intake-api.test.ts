import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { describeApi } from '../../apps/dental-api/src/bootstrap';
import { IDENTITY, type IdentityPort, type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { INTAKE_REPOSITORY, type IntakeRepository } from '../../apps/dental-api/src/intake/domain/intake';
import { IntakeModule } from '../../apps/dental-api/src/intake/intake.module';
import { A, B, STAFF, PATIENT, P1, P3 } from '../fixtures';
const input={display_name:' Synthetic inquiry ',contact_email:null,contact_phone:null,source:'phone' as const,follow_up_at:null};
const item={...input,display_name:'Synthetic inquiry',id:P1,clinic_id:A,owner_user_id:STAFF,status:'new' as const,created_at:'2026-10-26T12:00:00Z'};
const fakeIdentity:IdentityPort={
  verify:async token=>token==='patient'?PATIENT:['reception','manager','dentist','assistant','inactive'].includes(token)?STAFF:null,
  memberships:async token=>token==='patient'?[]:[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'reception':token) as StaffRole,active:token!=='inactive'}],
  patientLinks:async token=>token==='patient'?[{clinic_id:A,user_id:PATIENT,patient_id:P1,verified_at:'2026-10-26T12:00:00Z'}]:[],
};
describe('manual inquiry HTTP policy and contract',()=>{
  let app:INestApplication;
  const list=vi.fn<IntakeRepository['list']>();
  const create=vi.fn<IntakeRepository['create']>();
  const prior=process.env.ENABLE_INTAKE_COMMANDS;
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(fakeIdentity).overrideProvider(INTAKE_REPOSITORY).useValue({list,create}).compile();
    app=module.createNestApplication({logger:false}); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async()=>{await app?.close(); if(prior===undefined) delete process.env.ENABLE_INTAKE_COMMANDS; else process.env.ENABLE_INTAKE_COMMANDS=prior;});
  beforeEach(()=>{process.env.ENABLE_INTAKE_COMMANDS='true';list.mockReset().mockResolvedValue({items:[item],truncated:false});create.mockReset().mockResolvedValue({item,replayed:false});});
  function get(token='reception',clinic=A){return request(app.getHttpServer()).get('/api/v1/inquiries').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic);}
  function post(token='reception',clinic=A){return request(app.getHttpServer()).post('/api/v1/inquiries').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic).set('Idempotency-Key',P3);}
  it('allows authorized staff reads while rejecting missing/forged identity',async()=>{
    for(const role of ['reception','manager','dentist']) await get(role).expect(200);
    await request(app.getHttpServer()).get('/api/v1/inquiries').expect(401); await get('forged').expect(401);
  });
  it('denies assistants, patients, inactive members and foreign clinic selection',async()=>{
    for(const role of ['assistant','patient','inactive']) {await get(role).expect(403);await post(role).send(input).expect(403);}
    await get('reception',B).expect(403);await post('reception',B).send(input).expect(403);
    expect(list).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  });
  it('commands are default-disabled, without disabling authorized reads',async()=>{
    delete process.env.ENABLE_INTAKE_COMMANDS;const disabled=await post().send(input).expect(503);expect(disabled.body.code).toBe('intake_disabled');await get().expect(200);
    process.env.ENABLE_INTAKE_COMMANDS='TRUE';await post().send(input).expect(503);expect(create).not.toHaveBeenCalled();
  });
  it('rejects caller-owned state and invalid keys, fields and query selection',async()=>{
    for(const body of [{...input,owner_user_id:PATIENT},{...input,status:'confirmed'},{...input,id:P1},{...input,display_name:''},{...input,contact_email:'bad'}]) await post().send(body).expect(400);
    await post().unset('Idempotency-Key').send(input).expect(400);await post().set('Idempotency-Key','not-uuid').send(input).expect(400);
    await get().query({clinic_id:B}).expect(400);await post().query({clinic_id:B}).send(input).expect(400);expect(create).not.toHaveBeenCalled();
  });
  it('normalizes input and returns 201 create / 200 replay without token leakage',async()=>{
    const first=await post().send(input).expect(201);expect(first.body).toEqual({item,replayed:false});
    expect(create.mock.calls[0]?.[1].display_name).toBe('Synthetic inquiry');expect(create.mock.calls[0]?.[2]).toBe(P3);
    expect(create.mock.calls[0]?.[3]).toMatch(/^[0-9a-f-]{36}$/);
    create.mockResolvedValueOnce({item,replayed:true});await post().send(input).expect(200);
    expect(JSON.stringify(first.body)).not.toContain('token');
  });
  it('fails closed when a privileged repository returns foreign data or ownership',async()=>{
    list.mockResolvedValueOnce({items:[{...item,clinic_id:B}],truncated:false});const response=await get().expect(503);expect(response.text).not.toContain('Synthetic inquiry');expect(response.body.code).toBeUndefined();
    create.mockResolvedValueOnce({item:{...item,owner_user_id:PATIENT},replayed:false});await post().send(input).expect(503);
  });
  it('publishes request and response schemas from the frozen Zod contract',async()=>{
    const module=await Test.createTestingModule({imports:[IntakeModule]}).overrideProvider(INTAKE_REPOSITORY).useValue({list,create}).compile();
    const schemaApp=module.createNestApplication({logger:false});schemaApp.setGlobalPrefix('api/v1');await schemaApp.init();
    const document=describeApi(schemaApp); await schemaApp.close(); const endpoint=document.paths['/api/v1/inquiries'];
    const body=endpoint?.post?.requestBody as {content:Record<string,{schema:{required:string[];additionalProperties:boolean}}>};
    expect(body.content['application/json']?.schema.required).toEqual(['display_name','contact_email','contact_phone','source','follow_up_at']);
    expect(body.content['application/json']?.schema.additionalProperties).toBe(false);
    expect(endpoint?.post?.responses).toHaveProperty('201');expect(endpoint?.post?.responses).toHaveProperty('200');expect(endpoint?.post?.responses).toHaveProperty('503');
    expect(JSON.stringify(endpoint?.get?.responses['200'])).toContain('truncated');
  });
});
