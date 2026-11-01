import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {AppModule} from '../../apps/dental-api/src/app.module';
import {IDENTITY,type IdentityPort,type StaffRole} from '../../apps/dental-api/src/identity/domain/access';
import {A,B,STAFF,P1,P2} from '../fixtures';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',async original=>({...await original<object>(),scopedClient:()=>({rpc})}));
const identity:IdentityPort={verify:async token=>['manager','reception','dentist','assistant','inactive'].includes(token)?STAFF:null,memberships:async token=>[{clinic_id:A,user_id:STAFF,role:(token==='inactive'?'manager':token) as StaffRole,active:token!=='inactive'}],patientLinks:async()=>[]};
describe('local payment HTTP boundary',()=>{
  let app:INestApplication;
  const common={payment_id:P2,patient_id:P1,amount_minor:10000,currency_code:'MAD',synthetic_only:true,replayed:false};
  const cases=[
    {suffix:'',body:{method_id:P2,method_version:1,amount_minor:10000,currency_code:'MAD',effective_at:'2026-10-31T12:00:00Z',reference:'DEMO-QA'},receipt:{...common,version:1,state:'pending',settlement:'pending'},rpc:'record_local_payment'},
    {suffix:'/'+P2+'/transitions',body:{expected_version:1,action:'confirm',verified:true},receipt:{...common,version:2,state:'confirmed',settlement:'pending'},rpc:'transition_local_payment'},
    {suffix:'/'+P2+'/allocations',body:{invoice_id:STAFF,amount_minor:10000},receipt:{...common,allocation_id:A,invoice_id:STAFF,payment_unapplied_minor:0,invoice_remaining_minor:10000},rpc:'allocate_local_payment'},
    {suffix:'/'+P2+'/receipts',body:{},receipt:{...common,receipt_id:A,number:'DEMO-R-QA-1',issued_at:'2026-10-31T12:00:00Z'},rpc:'issue_local_payment_receipt'},
  ] as const;
  beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(IDENTITY).useValue(identity).compile();app=module.createNestApplication({logger:false});app.setGlobalPrefix('api/v1');await app.init();});
  afterAll(async()=>{await app?.close();vi.unstubAllEnvs();});
  beforeEach(()=>{rpc.mockReset();vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_PAYMENTS','true');vi.stubEnv('LOCAL_QUOTE_DRAFT_GATE_KEY','qa-gate');});
  const command=(suffix='',token='manager',clinic=A)=>request(app.getHttpServer()).post('/api/v1/finance/patients/'+P1+'/payments'+suffix).set('Authorization','Bearer '+token).set('X-Clinic-Id',clinic).set('Idempotency-Key',A);
  const read=(suffix='',token='manager',clinic=A)=>request(app.getHttpServer()).get('/api/v1/finance/patients/'+P1+'/payments'+suffix).set('Authorization','Bearer '+token).set('X-Clinic-Id',clinic);
  it('protects read scope and rejects mismatched or malformed projections',async()=>{
    for(const suffix of ['', '/'+P2+'/receipt']){
      await read(suffix).unset('Authorization').expect(401);for(const role of ['reception','dentist','assistant','inactive'])await read(suffix,role).expect(403);
      await read(suffix,'manager',B).expect(403);await read(suffix).query({clinic:B}).expect(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    const empty={clinic_id:A,patient_id:P1,synthetic_only:true,payments:[],invoices:[],methods:[],payments_truncated:false,invoices_truncated:false,methods_truncated:false};
    rpc.mockResolvedValueOnce({data:empty,error:null});const response=await read().expect(200);expect(response.body).toEqual(empty);expect(response.headers['cache-control']).toBe('no-store');
    expect(rpc).toHaveBeenLastCalledWith('read_local_patient_payments',{p_clinic_id:A,p_patient_id:P1,p_gate:'qa-gate'});
    for(const value of [{...empty,clinic_id:B},{...empty,patient_id:P2},{...empty,synthetic_only:false},{...empty,internal_note:'private'}]){rpc.mockResolvedValueOnce({data:value,error:null});await read().expect(503);}
    rpc.mockResolvedValueOnce({data:{receipt_id:A,patient_id:P1,payment_id:P2},error:null});await read('/'+P2+'/receipt').expect(503);
    rpc.mockResolvedValueOnce({data:null,error:{code:'PT404'}});await read('/'+P2+'/receipt').expect(404);
  });
  it('denies anonymous, non-manager, inactive and foreign clinic for every command',async()=>{
    for(const item of cases){await command(item.suffix).unset('Authorization').send(item.body).expect(401);for(const role of ['reception','dentist','assistant','inactive'])await command(item.suffix,role).send(item.body).expect(403);await command(item.suffix,'manager',B).send(item.body).expect(403);}expect(rpc).not.toHaveBeenCalled();
  });
  it('binds clinic patient and payment scope and returns validated no-store receipts',async()=>{
    for(const item of cases){rpc.mockResolvedValueOnce({data:item.receipt,error:null});const response=await command(item.suffix).send(item.body).expect(201);expect(response.body).toEqual(item.receipt);expect(response.headers['cache-control']).toBe('no-store');expect(rpc).toHaveBeenLastCalledWith(item.rpc,expect.objectContaining({p_clinic_id:A,p_patient_id:P1,p_request_key:A,p_gate:'qa-gate'}));if(item.suffix)expect(rpc).toHaveBeenLastCalledWith(item.rpc,expect.objectContaining({p_payment_id:P2}));}
    expect(rpc.mock.calls[0]![1].p_payload).toEqual(cases[0].body);
    expect(rpc.mock.calls[1]![1]).toMatchObject({p_action:'confirm',p_verified:true,p_expected_version:1});
    expect(rpc.mock.calls[2]![1]).toMatchObject({p_invoice_id:STAFF,p_amount_minor:10000});
  });
  it('rejects caller scope or extra fields missing keys and query parameters',async()=>{
    for(const item of cases){await command(item.suffix).send({...item.body,clinic_id:B}).expect(400);await command(item.suffix).send({...item.body,pan:'1234'}).expect(400);await command(item.suffix).unset('Idempotency-Key').send(item.body).expect(400);await command(item.suffix).query({patient_id:P2}).send(item.body).expect(400);}expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects malformed money currency references and verification assertions',async()=>{
    for(const value of [{amount_minor:0},{amount_minor:1.5},{amount_minor:1000000000001},{currency_code:'EUR'},{method_version:0},{effective_at:'bad'},{reference:'BANK-CREDENTIAL'}])await command().send({...cases[0].body,...value}).expect(400);
    for(const value of [{verified:false},{expected_version:0},{action:'refund'}])await command(cases[1].suffix).send({...cases[1].body,...value}).expect(400);
    await command(cases[2].suffix).send({...cases[2].body,amount_minor:-1}).expect(400);expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects inconsistent state and mismatched IDs or amounts from storage',async()=>{
    for(const item of cases){for(const value of [{patient_id:P2},{synthetic_only:false},{amount_minor:1.5},{unexpected:true}]){rpc.mockResolvedValueOnce({data:{...item.receipt,...value},error:null});await command(item.suffix).send(item.body).expect(503);}}
    const invalids=[{...cases[0].receipt,state:'confirmed'},{...cases[1].receipt,version:3},{...cases[1].receipt,state:'failed'},{...cases[1].receipt,settlement:'failed'},{...cases[2].receipt,invoice_id:P2},{...cases[2].receipt,amount_minor:1},{...cases[3].receipt,number:'LIVE-1'}];
    for(const [index,value] of invalids.entries()){const target=index===0?cases[0]:index<4?cases[1]:index<6?cases[2]:cases[3];rpc.mockResolvedValueOnce({data:value,error:null});await command(target.suffix).send(target.body).expect(503);}
  });
  it('validates settlement transitions against requested action',async()=>{
    for(const [action,state,settlement] of [['fail','failed','pending'],['settle','confirmed','settled'],['settlement_failed','confirmed','failed']] as const){rpc.mockResolvedValueOnce({data:{...common,version:2,state,settlement},error:null});await command(cases[1].suffix).send({expected_version:1,verified:true,action}).expect(201);rpc.mockResolvedValueOnce({data:{...common,version:2,state:'pending',settlement:'pending'},error:null});await command(cases[1].suffix).send({expected_version:1,verified:true,action}).expect(503);}
  });
  it('requires local URL explicit enable flag and server capability',async()=>{
    for(const url of ['https://example.supabase.co','http://127.0.0.1:54320','https://localhost:54321']){vi.stubEnv('SUPABASE_URL',url);await command().send(cases[0].body).expect(503);}vi.stubEnv('SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('ENABLE_LOCAL_PAYMENTS','false');await command().send(cases[0].body).expect(503);vi.stubEnv('ENABLE_LOCAL_PAYMENTS','true');vi.stubEnv('LOCAL_QUOTE_DRAFT_GATE_KEY','');await command().send(cases[0].body).expect(503);expect(rpc).not.toHaveBeenCalled();
  });
  it('maps database and network errors without leaking details',async()=>{
    for(const item of cases){for(const [code,status] of [['SH409',409],['SH410',409],['PT404',404],['42501',403],['28000',401],['22023',400],['PT503',503],['XX000',503]] as const){rpc.mockResolvedValueOnce({data:null,error:{code,message:'PRIVATE_DETAIL'}});const response=await command(item.suffix).send(item.body).expect(status);expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DETAIL');}rpc.mockRejectedValueOnce(new Error('PRIVATE_DETAIL'));await command(item.suffix).send(item.body).expect(503);}
  });
});
