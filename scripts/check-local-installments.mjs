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


  const target=await invoice(9), second=await invoice(2), foreign=await invoice(1,true,other),draft=await invoice(1,false);
  const body={plan_id:null,expected_version:0,reason:'Accord fictif initial',invoices:[{invoice_id:target,deposit_minor:0,credited_minor:0},{invoice_id:second,deposit_minor:0,credited_minor:0}],lines:[{invoice_id:target,due_on:'2026-11-15',amount_minor:30000},{invoice_id:target,due_on:'2026-12-15',amount_minor:60000},{invoice_id:second,due_on:'2026-11-15',amount_minor:20000}]};
  const key=randomUUID(),save=(payload=body,k=key,patientId=patient)=>rpc('save_local_installment_draft',[clinic,patientId,JSON.stringify(payload),k,gate]);
  await check('default-off local gate refuses even manager',()=>fails('PT503',()=>save()));
  await db.query('reset role');await db.query('insert into private.local_installment_settings(clinic_id,enabled) values($1,true)',[clinic]);await db.query('set local role authenticated');
  await check('unknown patient denied',()=>fails('PT404',()=>save(body,randomUUID(),randomUUID())));
  await check('foreign patient invoice denied',()=>fails('PT404',()=>save({...body,invoices:[{invoice_id:foreign,deposit_minor:0,credited_minor:0}]},randomUUID())));
  await check('unissued draft cannot become installment debt',()=>fails('PT404',()=>save({...body,invoices:[{invoice_id:draft,deposit_minor:0,credited_minor:0}]},randomUUID())));
  await check('negative fractional and zero amounts rejected',async()=>{for(const amount of [0,-1,0.5])await fails('22023',()=>save({...body,lines:[{...body.lines[0],amount_minor:amount}]},randomUUID()));});
  await check('sum must reconcile per invoice, not only combined total',()=>fails('22023',()=>save({...body,lines:[{...body.lines[0],amount_minor:110000}]},randomUUID())));
  await check('deposit treatment must equal real net allocations',()=>fails('SH409',()=>save({...body,invoices:body.invoices.map(i=>({...i,deposit_minor:1}))},randomUUID())));
  await check('credit treatment must equal posted credit total',()=>fails('SH409',()=>save({...body,invoices:body.invoices.map(i=>({...i,credited_minor:1}))},randomUUID())));
  await check('duplicate dates and malformed dates rejected',async()=>{await fails('22023',()=>save({...body,lines:[...body.lines,body.lines[0]]},randomUUID()));await fails('22023',()=>save({...body,lines:[{...body.lines[0],due_on:'2026-02-30'}]},randomUUID()));});
  await check('duplicate invoice scope rejected',()=>fails('22023',()=>save({...body,invoices:[...body.invoices,body.invoices[0]]},randomUUID())));
  await check('uppercase invoice identifiers cannot bypass deposit validation',()=>fails('SH409',()=>save({...body,invoices:body.invoices.map(i=>({...i,invoice_id:i.invoice_id.toUpperCase(),deposit_minor:1}))},randomUUID())));
  await check('foreign clinic denied before write',()=>fails('42501',()=>rpc('save_local_installment_draft',[randomUUID(),patient,JSON.stringify(body),randomUUID(),gate])));
  let first;await check('multi-invoice draft stores exact agreed total',async()=>{first=await save();assert.equal(first.agreed_minor,110000);assert.equal(first.version,1);assert.equal(first.status,'draft');});
  await check('exact retry returns same plan',async()=>assert.deepEqual(await save(),{...first,replayed:true}));
  await check('same key cannot replace terms',()=>fails('SH410',()=>save({...body,reason:'Changed'})));
  await check('second agreement cannot claim same invoice',()=>fails('SH409',()=>save(body,randomUUID())));
  const transition=(action,version=1,k=randomUUID(),patientId=patient)=>rpc('transition_local_installment_agreement',[clinic,patientId,first.plan_id,version,action,'DEMO-REVIEW',k,gate]);
  await check('acceptance requires prior approval',()=>fails('SH409',()=>transition('accepted')));
  await check('transition denies wrong patient',()=>fails('PT404',()=>transition('approved',1,randomUUID(),other)));
  const approveKey=randomUUID();let approved;
  await check('approval is separate immutable event',async()=>{approved=await transition('approved',1,approveKey);assert.equal(approved.status,'approved');});
  await check('approval replay exact',async()=>assert.deepEqual(await transition('approved',1,approveKey),{...approved,replayed:true}));
  await check('new-key duplicate approval rejected',()=>fails('SH409',()=>transition('approved')));
  await check('synthetic acceptance explicitly recorded',async()=>assert.equal((await transition('accepted')).status,'accepted'));
  const revised={...body,plan_id:first.plan_id,expected_version:1,reason:'Dates révisées fictives',lines:body.lines.map(i=>({...i,due_on:'2027'+i.due_on.slice(4)}))};
  await check('rescheduling appends a version',async()=>{const r=await save(revised,randomUUID());assert.equal(r.version,2);assert.equal(r.status,'draft');});
  await check('stale revision rejected',()=>fails('SH409',()=>save(revised,randomUUID())));
  await check('old version cannot transition after revision',()=>fails('SH409',()=>transition('approved',1)));
  await db.query('reset role');
  await check('prior accepted version stays effective while revision is draft',async()=>{const p=(await db.query('select latest_version,accepted_version from private.finance_installment_plans where clinic_id=$1 and id=$2',[clinic,first.plan_id])).rows[0];assert.deepEqual(p,{latest_version:2,accepted_version:1});assert.equal((await db.query('select count(*)::int n from private.finance_installment_lines where clinic_id=$1',[clinic])).rows[0].n,6);});
  await check('versions and events are immutable',async()=>{await fails('55000',()=>db.query('update private.finance_installment_versions set reason=$1 where clinic_id=$2',['Rewrite',clinic]));await fails('55000',()=>db.query('delete from private.finance_installment_events where clinic_id=$1',[clinic]));});
  await db.query('set local role authenticated');
  const method=await rpc('save_local_payment_method',[clinic,JSON.stringify({method_id:null,expected_version:0,code:'CASH',label:'Espèces QA',kind:'cash',active:true,reference_required:false,settlement_behavior:'at_confirmation',receiving_account_id:account}),randomUUID(),gate]);
  const payment=await rpc('record_local_payment',[clinic,patient,JSON.stringify({method_id:method.method_id,method_version:1,amount_minor:10000,currency_code:'MAD',effective_at:'2026-10-30T10:00:00Z',reference:'DEMO-QA'}),randomUUID(),gate]);
  await rpc('transition_local_payment',[clinic,patient,payment.payment_id,1,'confirm',true,randomUUID(),gate]);await rpc('allocate_local_payment',[clinic,patient,payment.payment_id,target,10000,randomUUID(),gate]);
  await check('approval rejects balance changed after draft',()=>fails('SH409',()=>transition('approved',2)));
  await rpc('issue_local_payment_receipt',[clinic,patient,payment.payment_id,randomUUID(),gate]);
  const originalReceipt=await rpc('read_local_payment_receipt',[clinic,patient,payment.payment_id,gate]);
  const third={...revised,expected_version:2,invoices:revised.invoices.map(i=>({...i,deposit_minor:i.invoice_id===target?10000:0})),lines:revised.lines.map((i,n)=>({...i,amount_minor:n===0?20000:i.amount_minor}))};
  await check('revision explicitly absorbs verified deposit',async()=>{const r=await save(third,randomUUID());assert.equal(r.agreed_minor,100000);assert.equal(r.version,3);});
  await transition('approved',3);await transition('accepted',3);
  await check('rescheduling preserves original payment receipt',async()=>assert.deepEqual(await rpc('read_local_payment_receipt',[clinic,patient,payment.payment_id,gate]),originalReceipt));
  await db.query('reset role');
  await check('new acceptance retains prior acceptance history',async()=>{const p=(await db.query('select accepted_version from private.finance_installment_plans where clinic_id=$1',[clinic])).rows[0];assert.equal(p.accepted_version,3);assert.equal((await db.query('select count(*)::int n from private.finance_installment_events where clinic_id=$1',[clinic])).rows[0].n,4);});
  await db.query("create function private.qa_reject_installment_outbox() returns trigger language plpgsql as $$ begin if new.event_type='LocalInstallmentDraftSaved' then raise exception 'Injected failure';end if;return new;end $$;create trigger qa_reject_installment_outbox before insert on private.outbox_events for each row execute function private.qa_reject_installment_outbox()");
  await db.query('set local role authenticated');
  await check('outbox failure rolls back entire revision',()=>fails('P0001',()=>save({...third,expected_version:3},randomUUID())));
  await db.query('reset role');await db.query('drop trigger qa_reject_installment_outbox on private.outbox_events;drop function private.qa_reject_installment_outbox()');
  await check('rollback leaves exact version command and audit counts',async()=>{assert.equal((await db.query('select latest_version from private.finance_installment_plans where clinic_id=$1',[clinic])).rows[0].latest_version,3);for(const table of ['finance_installment_commands','audit_events','outbox_events']){const extra=table==='audit_events'?" and action like 'LocalInstallment%'":table==='outbox_events'?" and event_type like 'LocalInstallment%'":'';assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1'+extra,[clinic])).rows[0].n,7);}});
  await db.query("update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2",[clinic,actor]);await db.query('set local role authenticated');
  await check('revoked membership cannot replay accepted command',()=>fails('42501',()=>save()));
  await db.query('reset role');await db.query('set local role anon');
  await check('anonymous caller cannot invoke agreement writer',()=>fails('42501',()=>save()));
  console.log(checks+' native installment checks passed; fixture rolled back.');
}finally{await db.query('rollback');await db.end();}
