import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY, type IdentityPort } from '../../apps/dental-api/src/identity/domain/access';
import { PATIENT_REPOSITORY } from '../../apps/dental-api/src/patients/domain/patient';
import { A, B, STAFF, PATIENT, P1, P2, syntheticRecords } from '../fixtures';
@Controller('unclassified') class UnclassifiedController { @Get() get() { return { secret: true }; } }
const fakeIdentity: IdentityPort = {
  verify: async token => token === 'test-staff' || token === 'test-inactive' ? STAFF : token === 'test-patient' ? PATIENT : null,
  memberships: async token => token === 'test-staff' ? [{ clinic_id:A,user_id:STAFF,role:'reception',active:true }] : [],
  patientLinks: async token => token === 'test-patient' ? [{ clinic_id:A,user_id:PATIENT,patient_id:P1,verified_at:'2026-10-26T10:00:00Z' }] : []
};
describe('HTTP policy boundary (in-process fake identity/repository)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports:[AppModule],controllers:[UnclassifiedController] })
      .overrideProvider(IDENTITY).useValue(fakeIdentity)
      .overrideProvider(PATIENT_REPOSITORY).useValue({ list: async () => syntheticRecords, find: async (_actor: unknown,id: string) => syntheticRecords.find(p => p.id === id) ?? null }).compile();
    app = module.createNestApplication({ logger:false }); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('health is public; patients are not', async () => { await request(app.getHttpServer()).get('/api/v1/health').expect(200); await request(app.getHttpServer()).get('/api/v1/patients').expect(401); });
  it('does not accept forged/expired bearer tokens', async () => { await request(app.getHttpServer()).get('/api/v1/patients').set('Authorization','Bearer forged').set('X-Clinic-Id',A).expect(401); });
  it('rejects inactive members and missing/foreign/malformed tenant context', async () => {
    for (const clinic of [B,'not-a-uuid','']) await request(app.getHttpServer()).get('/api/v1/patients').set('Authorization','Bearer test-staff').set('X-Clinic-Id',clinic).expect(403);
    await request(app.getHttpServer()).get('/api/v1/patients').set('Authorization','Bearer test-inactive').set('X-Clinic-Id',A).expect(403);
  });
  it('filters privileged repository data and denies foreign object IDs', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/patients').set('Authorization','Bearer test-staff').set('X-Clinic-Id',A).expect(200);
    expect(response.body.map((p: {clinic_id:string}) => p.clinic_id)).toEqual([A,A]);
    const denied = await request(app.getHttpServer()).get(`/api/v1/patients/${P2}`).set('Authorization','Bearer test-staff').set('X-Clinic-Id',A).expect(404);
    expect(JSON.stringify(denied.body)).not.toContain('Patient fictif B');
  });
  it('patient routes use own verified link and never staff list', async () => {
    await request(app.getHttpServer()).get('/api/v1/patients').set('Authorization','Bearer test-patient').set('X-Clinic-Id',A).expect(403);
    const own = await request(app.getHttpServer()).get('/api/v1/me/patient').set('Authorization','Bearer test-patient').set('X-Clinic-Id',A).expect(200);
    expect(own.body.id).toBe(P1);
    await request(app.getHttpServer()).get('/api/v1/me/patient').set('Authorization','Bearer test-patient').set('X-Clinic-Id',B).expect(403);
    const docs = await request(app.getHttpServer()).get('/api/v1/me/documents').set('Authorization','Bearer test-patient').set('X-Clinic-Id',A).expect(200);
    expect(docs.body.items).toEqual([]);
  });
  it('denies handlers with no declared policy even to authenticated staff', async () => { await request(app.getHttpServer()).get('/api/v1/unclassified').set('Authorization','Bearer test-staff').set('X-Clinic-Id',A).expect(403); });
  it('does not expose clinical mutations or signed-link generation', async () => {
    await request(app.getHttpServer()).post('/api/v1/encounters/sign').set('Authorization','Bearer test-staff').set('X-Clinic-Id',A).expect(404);
    await request(app.getHttpServer()).post('/api/v1/documents/signed-url').set('Authorization','Bearer test-patient').set('X-Clinic-Id',A).expect(404);
  });
});
