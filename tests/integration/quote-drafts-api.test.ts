import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/dental-api/src/app.module';
import { IDENTITY, type IdentityPort, type StaffRole } from '../../apps/dental-api/src/identity/domain/access';
import { A, B, STAFF, P1, P2 } from '../fixtures';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase', async original => ({ ...await original<object>(), scopedClient: () => ({ rpc }) }));
const identity: IdentityPort = {
  verify: async token => ['manager', 'reception', 'dentist', 'assistant', 'inactive'].includes(token) ? STAFF : null,
  memberships: async token => [{ clinic_id: A, user_id: STAFF, role: (token === 'inactive' ? 'manager' : token) as StaffRole, active: token !== 'inactive' }], patientLinks: async () => [],
};
describe('local quote draft HTTP boundary', () => {
  let app: INestApplication;
  const body = { lines: [{ service_id: P2, price_version: 1, quantity: 3 }] };
  const receipt = { quote_id: P2, patient_id: P1, version: 1, state: 'draft', currency_code: 'MAD', total_minor: 5250, replayed: false };
  const catalog = { synthetic_only: true, items: [{ service_id: P2, price_version: 1, label: 'Fictional service', currency_code: 'MAD', unit_amount_minor: 1750 }] };
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(IDENTITY).useValue(identity).compile(); app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1'); await app.init(); });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  beforeEach(() => { vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321'); vi.stubEnv('ENABLE_LOCAL_QUOTE_DRAFTS', 'true'); vi.stubEnv('LOCAL_QUOTE_DRAFT_GATE_KEY', 'synthetic-test'); rpc.mockReset().mockResolvedValue({ data: receipt, error: null }); });
  const create = (token = 'manager', clinic = A) => request(app.getHttpServer()).post(`/api/v1/finance/patients/${P1}/quotes`).set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic).set('Idempotency-Key', P2);
  const read = (token = 'manager', clinic = A) => request(app.getHttpServer()).get('/api/v1/finance/catalog').set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic);
  it('denies anonymous, non-manager, inactive and foreign-clinic callers before storage', async () => {
    await create().unset('Authorization').send(body).expect(401);
    for (const role of ['reception', 'dentist', 'assistant', 'inactive']) { await create(role).send(body).expect(403); await read(role).expect(403); }
    await create('manager', B).send(body).expect(403); await read('manager', B).expect(403); expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects extra fields, client amounts, invalid quantities, duplicates and missing keys', async () => {
    for (const value of [{ ...body, clinic_id: B }, { lines: [] }, { lines: [{ ...body.lines[0], unit_amount_minor: 1 }] }, { lines: [{ ...body.lines[0], quantity: 1.1 }] }, { lines: [body.lines[0], body.lines[0]] }]) await create().send(value).expect(400);
    await create().unset('Idempotency-Key').send(body).expect(400); await create().query({ clinic: B }).send(body).expect(400); await read().query({ patient: P1 }).expect(400); expect(rpc).not.toHaveBeenCalled();
  });
  it('binds the command to authorized scope, returns no-store validated receipt', async () => {
    const result = await create().send(body).expect(201); expect(result.body).toEqual(receipt); expect(result.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('create_local_quote_draft', { p_clinic_id: A, p_patient_id: P1, p_payload: body, p_request_key: P2, p_gate: 'synthetic-test' });
  });
  it('returns only validated local catalogue data', async () => {
    rpc.mockResolvedValueOnce({ data: catalog, error: null }); const result = await read().expect(200); expect(result.body).toEqual(catalog); expect(result.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('read_local_quote_catalog', { p_clinic_id: A, p_gate: 'synthetic-test' });
    for (const invalid of [{ ...catalog, synthetic_only: false }, { ...catalog, items: [catalog.items[0], catalog.items[0]] }]) { rpc.mockResolvedValueOnce({ data: invalid, error: null }); await read().expect(503); }
  });
  it('maps conflicts and authorization failures without exposing database messages', async () => {
    for (const [code, status] of [['SH409', 409], ['SH410', 409], ['PT404', 404], ['42501', 403], ['28000', 401], ['22023', 400], ['PT503', 503], ['XX000', 503]] as const) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'PRIVATE_DATABASE_DETAIL' } }); const result = await create().send(body).expect(status); expect(JSON.stringify(result.body)).not.toContain('PRIVATE_DATABASE_DETAIL');
    }
    rpc.mockRejectedValueOnce(new Error('PRIVATE_TRANSPORT_DETAIL')); const result = await create().send(body).expect(503); expect(JSON.stringify(result.body)).not.toContain('PRIVATE_TRANSPORT_DETAIL');
  });
  it('rejects mismatched patient, unexpected state/version and unsafe amount receipts', async () => {
    for (const changed of [{ patient_id: P2 }, { state: 'issued' }, { version: 2 }, { total_minor: -1 }, { total_minor: 1.5 }]) { rpc.mockResolvedValueOnce({ data: { ...receipt, ...changed }, error: null }); await create().send(body).expect(503); }
  });
  it('fails closed for hosted database, disabled switch and missing capability', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://hosted.example.invalid'); await create().send(body).expect(503); await read().expect(503);
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321'); vi.stubEnv('ENABLE_LOCAL_QUOTE_DRAFTS', 'false'); await create().send(body).expect(503);
    vi.stubEnv('ENABLE_LOCAL_QUOTE_DRAFTS', 'true'); vi.stubEnv('LOCAL_QUOTE_DRAFT_GATE_KEY', ''); await create().send(body).expect(503); expect(rpc).not.toHaveBeenCalled();
  });
  const revise = (token = 'manager', clinic = A) => request(app.getHttpServer()).post(`/api/v1/finance/patients/${P1}/quotes/${P2}/revisions`).set('Authorization', `Bearer ${token}`).set('X-Clinic-Id', clinic).set('Idempotency-Key', P2);
  it('validates and scopes revision commands separately from creation', async () => {
    const command = {...body, expected_version: 1};
    await revise().unset('Authorization').send(command).expect(401);
    await revise('reception').send(command).expect(403); await revise('manager', B).send(command).expect(403);
    await revise().send(body).expect(400); await revise().send({...command, expected_version: 0}).expect(400);
    await revise().send({...command, quote_id: P1}).expect(400); await revise().query({version: 1}).send(command).expect(400);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({data: {...receipt, version: 2}, error: null});
    const result = await revise().send(command).expect(201); expect(result.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('revise_local_quote_draft', {p_clinic_id: A, p_patient_id: P1, p_quote_id: P2, p_expected_version: 1, p_payload: body, p_request_key: P2, p_gate: 'synthetic-test'});
  });
  it('rejects revision receipt for another quote or version and reports stale revisions', async () => {
    const command = {...body, expected_version: 1};
    for (const changed of [{quote_id: P1, version: 2}, {version: 1}, {version: 3}, {patient_id: P2, version: 2}]) {
      rpc.mockResolvedValueOnce({data: {...receipt, ...changed}, error: null}); await revise().send(command).expect(503);
    }
    rpc.mockResolvedValueOnce({data: null, error: {code: 'SH409'}}); await revise().send(command).expect(409);
    vi.stubEnv('SUPABASE_URL','https://hosted.example.invalid'); await revise().send(command).expect(503);
  });
  const serviceBody={service_id:null,expected_version:0,code:'LOCAL-TEST',label:'Prestation fictive',category:null,unit_amount_minor:12500,archived:false};
  const serviceReceipt={service_id:P2,price_version:1,code:'LOCAL-TEST',label:'Prestation fictive',category:null,unit_amount_minor:12500,archived:false,currency_code:'MAD',effective_at:'2026-10-31T12:00:00.000Z',replayed:false};
  const saveService=(token='manager',clinic=A)=>request(app.getHttpServer()).post('/api/v1/finance/services').set('Authorization',`Bearer ${token}`).set('X-Clinic-Id',clinic).set('Idempotency-Key',P2);
  it('protects catalogue writes and validates local service fields',async()=>{
    await saveService().unset('Authorization').send(serviceBody).expect(401);
    for(const role of ['reception','dentist','assistant','inactive'])await saveService(role).send(serviceBody).expect(403);
    await saveService('manager',B).send(serviceBody).expect(403);
    for(const changed of [{unit_amount_minor:0},{unit_amount_minor:1.5},{expected_version:1},{archived:true},{code:'not valid'},{tax_rate:20}])await saveService().send({...serviceBody,...changed}).expect(400);
    await saveService().unset('Idempotency-Key').send(serviceBody).expect(400);expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({data:serviceReceipt,error:null});const result=await saveService().send(serviceBody).expect(201);expect(result.body).toEqual(serviceReceipt);expect(result.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('save_local_finance_service',{p_clinic_id:A,p_payload:serviceBody,p_request_key:P2,p_gate:'synthetic-test'});
  });
  it('rejects mismatched catalogue acknowledgements and stale edits',async()=>{
    for(const changed of [{price_version:2},{label:'Different'},{unit_amount_minor:12600},{archived:true},{category:'OTHER'}]){rpc.mockResolvedValueOnce({data:{...serviceReceipt,...changed},error:null});await saveService().send(serviceBody).expect(503);}
    rpc.mockResolvedValueOnce({data:null,error:{code:'SH409'}});await saveService().send({...serviceBody,service_id:P2,expected_version:1}).expect(409);
    rpc.mockResolvedValueOnce({data:{...serviceReceipt,service_id:P1,price_version:2},error:null});await saveService().send({...serviceBody,service_id:P2,expected_version:1}).expect(503);
  });
  it('reads manager-only catalogue including archived services',async()=>{
    const url='/api/v1/finance/services';
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer()).get(url).set('Authorization','Bearer reception').set('X-Clinic-Id',A).expect(403);
    const {replayed,...service}=serviceReceipt;expect(replayed).toBe(false);
    rpc.mockResolvedValueOnce({data:{synthetic_only:true,items:[{...service,archived:true}]},error:null});
    const result=await request(app.getHttpServer()).get(url).set('Authorization','Bearer manager').set('X-Clinic-Id',A).expect(200);expect(result.body.items[0].archived).toBe(true);expect(result.headers['cache-control']).toBe('no-store');
    vi.stubEnv('ENABLE_LOCAL_QUOTE_DRAFTS','false');await saveService().send(serviceBody).expect(503);
  });
  it('supports an explicitly pinned hosted deployment without changing role or tenant boundaries',async()=>{
    vi.stubEnv('SUPABASE_URL','https://giufpdppsunryyhfnzps.supabase.co');
    vi.stubEnv('HOSTED_SUPABASE_PROJECT_REF','giufpdppsunryyhfnzps');
    vi.stubEnv('ENABLE_HOSTED_QUOTE_DRAFTS','true');
    vi.stubEnv('HOSTED_FINANCE_GATE_KEY','hosted-test-gate');
    await create('assistant').send(body).expect(403);
    await create('manager',B).send(body).expect(403);
    expect(rpc).not.toHaveBeenCalled();
    await create().send(body).expect(201);
    expect(rpc).toHaveBeenCalledWith('create_local_quote_draft',expect.objectContaining({p_clinic_id:A,p_patient_id:P1,p_gate:'hosted-test-gate'}));
    rpc.mockClear();vi.stubEnv('HOSTED_SUPABASE_PROJECT_REF','anotherproject000000');
    await create().send(body).expect(503);expect(rpc).not.toHaveBeenCalled();
  });
});
