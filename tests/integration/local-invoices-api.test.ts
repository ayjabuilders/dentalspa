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
  verify: async token => ['manager','reception','dentist','assistant','inactive'].includes(token) ? STAFF : null,
  memberships: async token => [{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'manager':token) as StaffRole,active:token!=='inactive'}], patientLinks:async()=>[],
};
describe('local invoice HTTP boundary',()=>{
  let app:INestApplication;
  const body={quote_id:P2,quote_version:2};
  const draft={invoice_id:P2,patient_id:P1,quote_id:P2,quote_version:2,state:'draft',currency_code:'MAD',total_minor:30000,synthetic_only:true,replayed:false};
  const issued={invoice_id:P2,patient_id:P1,state:'issued',currency_code:'MAD',total_minor:30000,synthetic_only:true,replayed:false,number:'DEMO-QA-1',issued_at:'2026-10-31T12:00:00.000Z'};
  beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
  afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
  beforeEach(()=>{vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_INVOICES','true');vi.stubEnv('LOCAL_QUOTE_DRAFT_GATE_KEY','synthetic-test');rpc.mockReset().mockResolvedValue({data:draft,error:null});});
  const command=(issue=false,token='manager',clinic=A)=>request(app.getHttpServer()).post('/api/v1/finance/patients/'+P1+'/invoices'+(issue?'/'+P2+'/issue':'')).set('Authorization','Bearer '+token).set('X-Clinic-Id',clinic).set('Idempotency-Key',P2);
  const read=(token='manager',clinic=A)=>request(app.getHttpServer()).get('/api/v1/finance/patients/'+P1+'/invoices').set('Authorization','Bearer '+token).set('X-Clinic-Id',clinic);
  const record={invoice_id:P2,patient_id:P1,quote_id:P2,quote_version:2,state:'issued',number:'DEMO-QA-1',issued_at:'2026-10-31T12:00:00.000Z',created_at:'2026-10-31T11:00:00.000Z',total_minor:30000,currency_code:'MAD',snapshot:{
    schema_version:1,synthetic_only:true,clinic:{id:A,name:'Cabinet FICTIF'},patient:{id:P1,reference:'QA-1',display_name:'Salma FICTIF'},payer:{id:P1,reference:'QA-1',display_name:'Salma FICTIF'},payer_basis:'patient_self_synthetic_fixture',disclaimer:'LOCAL SYNTHETIC DOCUMENT - NOT A STATUTORY INVOICE',
    quote:{id:P2,version:2,state:'draft',currency_code:'MAD',total_minor:30000,details:{subtotal_minor:30000,discount_minor:0,tax_minor:0,valid_until:null,lines:[{line_number:1,label:'Service FICTIF',quantity:3,unit_amount_minor:10000,subtotal_minor:30000,discount_minor:0,tax_minor:0,total_minor:30000}]}},
  }};
  it('reads only manager-authorized snapshot lists with no-store headers',async()=>{
    await read().unset('Authorization').expect(401);
    for(const role of ['reception','dentist','assistant','inactive'])await read(role).expect(403);
    await read('manager',B).expect(403);await read().query({patient_id:P2}).expect(400);expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({data:{synthetic_only:true,items:[record],truncated:false},error:null});const response=await read().expect(200);expect(response.body.items).toEqual([record]);expect(response.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('read_local_invoices',{p_clinic_id:A,p_patient_id:P1,p_gate:'synthetic-test'});
  });
  it('rejects mixed tenant/patient, corrupt totals, inconsistent state and extra private fields',async()=>{
    const variants=[{...record,patient_id:P2},{...record,total_minor:1},{...record,number:null},{...record,state:'draft'},
      {...record,snapshot:{...record.snapshot,clinic:{...record.snapshot.clinic,id:B}}},
      {...record,snapshot:{...record.snapshot,payer:{...record.snapshot.payer,id:P2}}},
      {...record,snapshot:{...record.snapshot,quote:{...record.snapshot.quote,details:{...record.snapshot.quote.details,lines:[{...record.snapshot.quote.details.lines[0],quantity:4}]}}}},
      {...record,created_by:STAFF}];
    for(const value of variants){rpc.mockResolvedValueOnce({data:{synthetic_only:true,items:[value],truncated:false},error:null});await read().expect(503);}
    rpc.mockResolvedValueOnce({data:{synthetic_only:true,items:[record,record],truncated:false},error:null});await read().expect(503);
  });
  it('denies anonymous, foreign, inactive and non-manager callers before RPC',async()=>{
    for(const issue of [false,true]){
      await command(issue).unset('Authorization').send(issue?{}:body).expect(401);
      for(const role of ['reception','dentist','assistant','inactive'])await command(issue,role).send(issue?{}:body).expect(403);
      await command(issue,'manager',B).send(issue?{}:body).expect(403);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects caller prices, payer override, scope, numbering and missing command keys',async()=>{
    for(const changed of [{total_minor:1},{patient_id:P2},{clinic_id:B},{payer:P2},{quote_version:0},{quote_version:1.2},{quote_id:'bad'}])await command().send({...body,...changed}).expect(400);
    for(const value of [{number:'DEMO-1'},{total_minor:1},{paid:true},{clinic_id:B}])await command(true).send(value).expect(400);
    for(const issue of [false,true]){await command(issue).unset('Idempotency-Key').send(issue?{}:body).expect(400);await command(issue).query({clinic:B}).send(issue?{}:body).expect(400);}
    expect(rpc).not.toHaveBeenCalled();
  });
  it('prepares exact authorized quote version and returns unnumbered no-store receipt',async()=>{
    const response=await command().send(body).expect(201);expect(response.body).toEqual(draft);expect(response.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('prepare_local_invoice',{p_clinic_id:A,p_patient_id:P1,p_quote_id:P2,p_quote_version:2,p_request_key:P2,p_gate:'synthetic-test'});
  });
  it('issues only the selected patient invoice and preserves replay result',async()=>{
    rpc.mockResolvedValue({data:{...issued,replayed:true},error:null});const response=await command(true).send({}).expect(201);
    expect(response.body).toEqual({...issued,replayed:true});expect(response.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('issue_local_invoice',{p_clinic_id:A,p_patient_id:P1,p_invoice_id:P2,p_request_key:P2,p_gate:'synthetic-test'});
  });
  it('rejects mismatched preparation receipts and non-synthetic data',async()=>{
    for(const changed of [{patient_id:P2},{quote_id:P1},{quote_version:3},{synthetic_only:false},{total_minor:1.5},{number:'DEMO-1'}]){rpc.mockResolvedValueOnce({data:{...draft,...changed},error:null});await command().send(body).expect(503);}
  });
  it('rejects mismatched issued receipts, invalid series and false payment claims',async()=>{
    for(const changed of [{patient_id:P2},{invoice_id:P1},{state:'paid'},{number:'REAL-1'},{number:'DEMO-0'},{issued_at:'yesterday'},{synthetic_only:false},{paid:true}]){rpc.mockResolvedValueOnce({data:{...issued,...changed},error:null});await command(true).send({}).expect(503);}
  });
  it('requires an explicit local-only API gate',async()=>{
    for(const url of ['https://example.supabase.co','http://127.0.0.1:54320','https://localhost:54321']){vi.stubEnv('SUPABASE_URL',url);await command().send(body).expect(503);}
    vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_INVOICES','false');await command().send(body).expect(503);
    vi.stubEnv('ENABLE_LOCAL_INVOICES','true');vi.stubEnv('LOCAL_QUOTE_DRAFT_GATE_KEY','');await command(true).send({}).expect(503);expect(rpc).not.toHaveBeenCalled();
  });
  it('sanitizes database failures and transport errors for both commands',async()=>{
    for(const issue of [false,true]){
      for(const [code,status] of [['SH409',409],['SH410',409],['42501',403],['28000',401],['PT404',404],['22023',400],['PT503',503],['XX000',503]] as const){rpc.mockResolvedValueOnce({data:null,error:{code,message:'PRIVATE_DETAIL'}});const response=await command(issue).send(issue?{}:body).expect(status);expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DETAIL');}
      rpc.mockRejectedValueOnce(new Error('PRIVATE_DETAIL'));const response=await command(issue).send(issue?{}:body).expect(503);expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DETAIL');
    }
  });
});
