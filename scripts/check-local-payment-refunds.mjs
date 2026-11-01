import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
const clinic=randomUUID(),patient=randomUUID(),other=randomUUID(),account=randomUUID(),gate=randomUUID();let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
async function fails(code,fn){await db.query('savepoint expected_failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint expected_failure');assert.equal(error?.code,code);}
await db.connect();try{
  await db.query('begin');
  if(!(await db.query("select to_regclass('private.finance_payment_allocations') is not null present")).rows[0].present){assert.ok(!process.argv.includes('--concurrency'),'Apply reviewed migration locally before concurrent verification');await db.query(readFileSync(new URL('../supabase/migrations/20261031121529_local_payment_allocations.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));}
  const actor=(await db.query("select user_id from public.clinic_memberships where active and role='manager' limit 1")).rows[0].user_id;
  const receipts=process.argv.includes('--receipts');
  if(receipts&&!(await db.query("select to_regclass('private.finance_payment_receipts') is not null present")).rows[0].present){assert.ok(!process.argv.includes('--concurrency'),'Apply reviewed receipt migration before concurrent verification');await db.query(readFileSync(new URL('../supabase/migrations/20261031121850_local_payment_receipts.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));}
  await db.query("insert into public.clinics(id,name) values($1,'Allocation QA FICTIF')",[clinic]);
  await db.query("insert into public.patients(clinic_id,id,reference,display_name) values($1,$2,'QA-1','Salma FICTIF'),($1,$3,'QA-2','Yassine FICTIF')",[clinic,patient,other]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true)",[clinic,actor]);
  await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2)',[clinic,gate]);
  await db.query('insert into private.local_payment_settings(clinic_id,enabled) values($1,true)',[clinic]);
  await db.query("insert into private.local_invoice_settings(clinic_id,drafts_enabled,issuance_enabled,series_code) values($1,true,true,'DEMO-QA')",[clinic]);
  await db.query("insert into private.finance_receiving_accounts(clinic_id,id,label,kind) values($1,$2,'Caisse QA','cash_drawer')",[clinic,account]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;
  const service=await rpc('save_local_finance_service',[clinic,JSON.stringify({service_id:null,expected_version:0,code:'QA',label:'Prestation fictive',category:null,unit_amount_minor:10000,archived:false}),randomUUID(),gate]);
  async function invoice(quantity,issued=true,patientId=patient){const quote=await rpc('create_local_quote_draft',[clinic,patientId,JSON.stringify({lines:[{service_id:service.service_id,price_version:1,quantity}]}),randomUUID(),gate]);const draft=await rpc('prepare_local_invoice',[clinic,patientId,quote.quote_id,1,randomUUID(),gate]);if(issued)await rpc('issue_local_invoice',[clinic,patientId,draft.invoice_id,randomUUID(),gate]);return draft.invoice_id;}

  const target=await invoice(9);
  const method=await rpc('save_local_payment_method',[clinic,JSON.stringify({method_id:null,expected_version:0,code:'CASH',label:'Espèces QA',kind:'cash',active:true,reference_required:false,settlement_behavior:'at_confirmation',receiving_account_id:account}),randomUUID(),gate]);
  async function payment(amount,confirmed=true){const receipt=await rpc('record_local_payment',[clinic,patient,JSON.stringify({method_id:method.method_id,method_version:1,amount_minor:amount,currency_code:'MAD',effective_at:'2026-10-30T10:00:00Z',reference:'DEMO-QA'}),randomUUID(),gate]);if(confirmed)await rpc('transition_local_payment',[clinic,patient,receipt.payment_id,1,'confirm',true,randomUUID(),gate]);return receipt.payment_id;}
  const deposit=await payment(30000),source=await payment(20000),pending=await payment(5000,false);
  await rpc('allocate_local_payment',[clinic,patient,deposit,target,30000,randomUUID(),gate]);
  const allocation=await rpc('allocate_local_payment',[clinic,patient,source,target,20000,randomUUID(),gate]);
  const receipt=await rpc('issue_local_payment_receipt',[clinic,patient,source,randomUUID(),gate]);
  const body={kind:'refund',amount_minor:10000,reason:'Retour fictif vérifié',reference:'DEMO-REFUND',effective_at:'2026-10-31T10:00:00Z',verified:true,releases:[{allocation_id:allocation.allocation_id,amount_minor:10000}]},refundKey=randomUUID();
  const refund=(payload=body,key=refundKey,paymentId=source,patientId=patient)=>rpc('record_local_payment_refund',[clinic,patientId,paymentId,JSON.stringify(payload),key,gate]);
  let first;
  await check('manager without dedicated permission cannot refund',()=>fails('42501',()=>refund()));
  await db.query('reset role');await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,refund_allowed) values($1,$2,true)',[clinic,actor]);await db.query('set local role authenticated');
  await check('verified refund releases explicitly selected allocation',async()=>{first=await refund();assert.equal(first.amount_minor,10000);assert.equal(first.net_paid_minor,10000);assert.equal(first.released_minor,10000);assert.equal(first.refunded_minor,10000);});
  await check('current projection includes refund and reopens invoice balance',async()=>{const result=await rpc('read_local_patient_payments',[clinic,patient,gate]),p=result.payments.find(p=>p.payment_id===source),i=result.invoices.find(i=>i.invoice_id===target);assert.equal(p.refunded_minor,10000);assert.equal(p.allocated_minor,10000);assert.equal(p.available_minor,0);assert.equal(i.allocated_minor,40000);assert.equal(i.remaining_minor,50000);});
  await check('refunded amount cannot be spent again through existing allocator',()=>fails('SH409',()=>rpc('allocate_local_payment',[clinic,patient,source,target,1,randomUUID(),gate])));
  await check('exact retry returns original acknowledgement',async()=>assert.deepEqual(await refund(),{...first,replayed:true}));
  await check('key cannot change refund reason',()=>fails('SH410',()=>refund({...body,reason:'Different'})));
  await check('unverified request is not a refund',()=>fails('22023',()=>refund({...body,verified:false},randomUUID())));
  await check('strict fields amounts dates and release identities validated',async()=>{for(const payload of [{...body,amount_minor:0},{...body,amount_minor:0.5},{...body,reason:' '},{...body,iban:'NOT-ALLOWED'},{...body,reference:'REAL'},{...body,effective_at:'2026-10-29T10:00:00Z'},{...body,releases:[...body.releases,...body.releases]},{...body,amount_minor:9999}])await fails('22023',()=>refund(payload,randomUUID()));});
  await check('more than original net payment rejected',()=>fails('SH409',()=>refund({...body,amount_minor:10001,releases:[]},randomUUID())));
  await check('allocated funds cannot be refunded as unapplied funds',()=>fails('SH409',()=>refund({...body,releases:[]},randomUUID())));
  await check('foreign patient/payment denied',()=>fails('PT404',()=>refund(body,randomUUID(),source,other)));
  await check('unknown allocation denied',()=>fails('PT404',()=>refund({...body,releases:[{allocation_id:randomUUID(),amount_minor:10000}]},randomUUID())));
  await check('uncleared payment denied',()=>fails('SH409',()=>refund({...body,releases:[]},randomUUID(),pending)));
  await db.query('reset role');
  const due=async()=>(await db.query('select d.total_minor-coalesce((select sum(a.amount_minor) from private.finance_payment_allocations a where a.clinic_id=d.clinic_id and a.invoice_id=d.id),0)+coalesce((select sum(r.amount_minor) from private.finance_allocation_releases r join private.finance_payment_allocations a on a.clinic_id=r.clinic_id and a.id=r.allocation_id where a.clinic_id=d.clinic_id and a.invoice_id=d.id),0) as due from private.finance_invoice_drafts d where clinic_id=$1 and id=$2',[clinic,target])).rows[0].due;
  await check('900MAD invoice minus300 and200 then100refund equals500due',async()=>assert.equal(Number(await due()),50000));
  await check('original receipt and allocated history remain unchanged',async()=>{assert.equal((await db.query('select snapshot from private.finance_payment_receipts where clinic_id=$1 and id=$2',[clinic,receipt.receipt_id])).rows[0].snapshot.amount_minor,20000);assert.equal((await db.query('select amount_minor from private.finance_payment_allocations where clinic_id=$1 and id=$2',[clinic,allocation.allocation_id])).rows[0].amount_minor,'20000');});
  await check('refund and release cannot be rewritten',async()=>{await fails('55000',()=>db.query('delete from private.finance_payment_refunds where clinic_id=$1',[clinic]));await fails('55000',()=>db.query('update private.finance_allocation_releases set amount_minor=1 where clinic_id=$1',[clinic]));});
  await db.query("create function pg_temp.fail_refund_outbox() returns trigger language plpgsql as $$ begin if new.event_type='LocalPaymentRefundVerified' then raise exception 'injected';end if;return new;end $$");await db.query('create trigger qa_refund_outbox before insert on private.outbox_events for each row execute function pg_temp.fail_refund_outbox()');await db.query('set local role authenticated');
  await check('outbox failure rolls back refund/release/receipt',()=>fails('P0001',()=>refund(body,randomUUID())));await db.query('reset role');await db.query('drop trigger qa_refund_outbox on private.outbox_events');
  await check('failed write leaves exactly one refund and release',async()=>{for(const table of ['finance_payment_refunds','finance_allocation_releases'])assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1',[clinic])).rows[0].n,1);assert.equal(Number(await due()),50000);});
  await db.query('set local role authenticated');const unapplied=await payment(8000);
  await check('unapplied deposit refund requires no allocation release',async()=>{const value=await refund({...body,kind:'reversal',amount_minor:3000,releases:[]},randomUUID(),unapplied);assert.equal(value.net_paid_minor,5000);assert.equal(value.released_minor,0);assert.equal(value.kind,'reversal');});
  await check('new receipt pins net allocations and prior refunded amount as version2',async()=>{const r=await rpc('issue_local_payment_receipt',[clinic,patient,unapplied,randomUUID(),gate]);const d=await rpc('read_local_payment_receipt',[clinic,patient,unapplied,gate]);assert.equal(d.receipt_id,r.receipt_id);assert.equal(d.snapshot.schema_version,2);assert.equal(d.snapshot.amount_minor,8000);assert.equal(d.snapshot.refunded_minor,3000);assert.equal(d.snapshot.unapplied_minor,5000);});
  await check('remaining unallocated net money may still be allocated exactly',async()=>{await db.query('savepoint net_allocation');const r=await rpc('allocate_local_payment',[clinic,patient,unapplied,target,5000,randomUUID(),gate]);assert.equal(r.payment_unapplied_minor,0);assert.equal(r.invoice_remaining_minor,45000);await fails('SH409',()=>rpc('allocate_local_payment',[clinic,patient,unapplied,target,1,randomUUID(),gate]));await db.query('rollback to savepoint net_allocation');});
  await check('remaining refund may exhaust original funds exactly once',async()=>{const value=await refund(body,randomUUID());assert.equal(value.net_paid_minor,0);await fails('SH409',()=>refund(body,randomUUID()));});
  await db.query('reset role');await db.query('update private.local_finance_correction_permissions set refund_allowed=false where clinic_id=$1',[clinic]);await db.query('set local role authenticated');
  await check('permission removal blocks even exact replay',()=>fails('42501',()=>refund()));
  await check('private permissions and ledgers inaccessible',async()=>{await fails('42501',()=>db.query('select * from private.local_finance_correction_permissions'));await fails('42501',()=>db.query('select * from private.finance_payment_refunds'));});
  await db.query('reset role');await db.query('set local role anon');await check('anonymous refund denied',()=>fails('42501',()=>refund()));
  console.log(checks+' refund ledger checks passed; all fixture changes rolled back. Net allocation/read/receipt projections verified; no owner records changed.');
}finally{await db.query('rollback');await db.end();}
