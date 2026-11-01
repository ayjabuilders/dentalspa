import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { NextFunction,Request,Response } from 'express';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY,type IdentityPort,type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { PATIENT_REPOSITORY } from '../../apps/dental-api/src/patients/domain/patient';
import { safeCorrelation } from '../../apps/dental-api/src/audit/redaction';
import { A,STAFF,PATIENT,P1 } from '../fixtures';

const CORRELATION='50000000-0000-4000-8000-000000000002';
const KEY='50000000-0000-4000-8000-000000000001';
const state={schema_version:1 as const,clinic_id:A,patient_id:P1,contact_preference:null,language:null,time_zone:null,revision:0,updated_at:null};
const input={expected_revision:0,contact_preference:'phone' as const,language:'fr' as const,time_zone:'Africa/Casablanca' as const};
const receipt={clinic_id:A,patient_id:P1,previous_contact_preference:null,contact_preference:'phone' as const,previous_language:null,language:'fr' as const,previous_time_zone:null,time_zone:'Africa/Casablanca' as const,previous_revision:0,revision:1,changed:true,recorded_at:'2026-10-29T12:00:00.123456Z',catalogue_version:1 as const,event_version:1 as const};
const identity:IdentityPort={
  verify:async token=>token==='patient'?PATIENT:token==='reception'?STAFF:null,
  memberships:async(token)=>token==='reception'?[{clinic_id:A,user_id:STAFF,role:'reception' as StaffRole,active:true}]:[],
  patientLinks:async token=>token==='patient'?[{clinic_id:A,user_id:PATIENT,patient_id:P1,verified_at:'2026-10-29T11:00:00Z'}]:[],
};

describe('patient-owned communication preferences HTTP boundary',()=>{
  let app:INestApplication;
  const getPreferences=vi.fn();
  const setPreferences=vi.fn();
  const originalFlag=process.env.ENABLE_PATIENT_COMMUNICATION_PREFERENCES;
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity)
      .overrideProvider(PATIENT_REPOSITORY).useValue({
        list:async()=>[],find:async()=>null,lookup:async()=>({items:[],truncated:false}),readOwnProfile:async()=>null,
        getOwnCommunicationPreferences:getPreferences,setOwnCommunicationPreferences:setPreferences,
      }).compile();
    app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');
    app.use((req:Request & {correlationId?:string},res:Response,next:NextFunction)=>{req.correlationId=safeCorrelation(req.headers['x-correlation-id']);res.setHeader('X-Correlation-Id',req.correlationId);next();});
    await app.init();
  });
  afterAll(async()=>{await app?.close();if(originalFlag===undefined)delete process.env.ENABLE_PATIENT_COMMUNICATION_PREFERENCES;else process.env.ENABLE_PATIENT_COMMUNICATION_PREFERENCES=originalFlag;});
  beforeEach(()=>{process.env.ENABLE_PATIENT_COMMUNICATION_PREFERENCES='false';getPreferences.mockReset().mockResolvedValue(state);setPreferences.mockReset().mockResolvedValue({receipt,replayed:false});});
  const own=()=>request(app.getHttpServer()).get('/api/v1/me/preferences').set('Authorization','Bearer patient').set('X-Clinic-Id',A);

  it('reads only the verified actor profile with no-store and rejects query selection',async()=>{
    const response=await own().expect(200);
    expect(response.headers['cache-control']).toBe('no-store');expect(response.body).toEqual(state);
    expect(getPreferences).toHaveBeenCalledOnce();
    expect(getPreferences.mock.calls[0]?.[0]).toMatchObject({userId:PATIENT,clinicId:A,patientId:P1,roles:[]});
    await own().query({patient_id:'30000000-0000-4000-8000-000000000099'}).expect(400);
    await request(app.getHttpServer()).get('/api/v1/me/preferences').set('Authorization','Bearer patient').set('X-Clinic-Id','10000000-0000-4000-8000-000000000099').expect(403);
    await request(app.getHttpServer()).get('/api/v1/me/preferences').set('Authorization','Bearer reception').set('X-Clinic-Id',A).expect(403);
  });

  it('keeps writes disabled by default and invokes only the verified patient command when enabled',async()=>{
    await request(app.getHttpServer()).post('/api/v1/me/preferences').set('Authorization','Bearer patient').set('X-Clinic-Id',A).set('Idempotency-Key',KEY).send(input).expect(503);
    expect(setPreferences).not.toHaveBeenCalled();
    process.env.ENABLE_PATIENT_COMMUNICATION_PREFERENCES='true';
    const response=await request(app.getHttpServer()).post('/api/v1/me/preferences').set('Authorization','Bearer patient').set('X-Clinic-Id',A).set('Idempotency-Key',KEY).set('X-Correlation-Id',CORRELATION).send(input).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');expect(response.body).toEqual({receipt,replayed:false});
    expect(setPreferences).toHaveBeenCalledOnce();
    expect(setPreferences.mock.calls[0]).toMatchObject([{userId:PATIENT,clinicId:A,patientId:P1},input,KEY,CORRELATION]);
    await request(app.getHttpServer()).post('/api/v1/me/preferences?patient_id=foreign').set('Authorization','Bearer patient').set('X-Clinic-Id',A).set('Idempotency-Key',KEY).send(input).expect(400);
    await request(app.getHttpServer()).post('/api/v1/me/preferences').set('Authorization','Bearer reception').set('X-Clinic-Id',A).set('Idempotency-Key',KEY).send(input).expect(403);
  });
});
