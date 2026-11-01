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
  if(!(await db.query("select to_regclass('private.finance_installment_allocations') present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261031160000_local_installment_allocations.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
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



 const target=await invoice(1),second=await invoice(1);
 await db.query('reset role');await db.query('insert into private.local_installment_settings(clinic_id,enabled) values($1,true)',[clinic]);await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,refund_allowed) values($1,$2,true)',[clinic,actor]);await db.query('set local role authenticated');
 const method=await rpc('save_local_payment_method',[clinic,JSON.stringify({method_id:null,expected_version:0,code:'CASH',label:'Espèces QA',kind:'cash',active:true,reference_required:false,settlement_behavior:'at_confirmation',receiving_account_id:account}),randomUUID(),gate]);
 async function payment(amount,confirmed=true){const p=await rpc('record_local_payment',[clinic,patient,JSON.stringify({method_id:method.method_id,method_version:1,amount_minor:amount,currency_code:'MAD',effective_at:'2026-10-31T10:00:00Z',reference:'DEMO-QA'}),randomUUID(),gate]);if(confirmed)await rpc('transition_local_payment',[clinic,patient,p.payment_id,1,'confirm',true,randomUUID(),gate]);return p.payment_id;}
 const paid=await payment(10000),unconfirmed=await payment(1000,false);
 const body={plan_id:null,expected_version:0,reason:'Échéances QA FICTIF',invoices:[{invoice_id:target,deposit_minor:0,credited_minor:0}],lines:[{invoice_id:target,due_on:'2000-01-01',amount_minor:4000},{invoice_id:target,due_on:'2099-01-01',amount_minor:6000}]};
 const plan=await rpc('save_local_installment_draft',[clinic,patient,JSON.stringify(body),randomUUID(),gate]);
 const detail=await rpc('read_local_installment_version',[clinic,patient,plan.plan_id,1,gate]);const line=detail.lines[0].line_id;
 const allocate=(amount,key=randomUUID(),paymentId=paid,lineId=line,version=1,patientId=patient)=>rpc('allocate_local_installment_payment',[clinic,patientId,plan.plan_id,version,lineId,paymentId,amount,key,gate]);
 const balances=(version=1)=>rpc('read_local_installment_balances',[clinic,patient,plan.plan_id,version,gate]);
 const accept=async(version)=>{for(const action of ['approved','accepted'])await rpc('transition_local_installment_agreement',[clinic,patient,plan.plan_id,version,action,'DEMO-AGREEMENT',randomUUID(),gate]);};
 await check('draft is unpaid but not overdue or payable',async()=>{const r=await balances();assert.equal(r.active,false);assert.equal(r.lines[0].overdue,false);await fails('SH409',()=>allocate(1000));});
 await db.query('reset role');await db.query('update private.local_installment_settings set enabled=false where clinic_id=$1',[clinic]);await db.query('set local role authenticated');
 await check('disabled local gate rejects allocation',()=>fails('PT503',()=>allocate(1000)));
 await db.query('reset role');await db.query('update private.local_installment_settings set enabled=true where clinic_id=$1',[clinic]);await db.query('set local role authenticated');
 await check('foreign clinic cannot read or allocate',async()=>{await fails('42501',()=>rpc('read_local_installment_balances',[randomUUID(),patient,plan.plan_id,1,gate]));await fails('42501',()=>rpc('allocate_local_installment_payment',[randomUUID(),patient,plan.plan_id,1,line,paid,1000,randomUUID(),gate]));});
 await accept(1);
 await check('accepted past installment is overdue, future one is not',async()=>{const r=await balances();assert.equal(r.active,true);assert.equal(r.lines[0].overdue,true);assert.equal(r.lines[1].overdue,false);assert.equal(r.requires_revision,false);});
 await check('invalid and fractional amounts rejected',async()=>{for(const n of [0,-1,0.5])await fails('22023',()=>allocate(n));});
 await check('foreign patient and unknown line refused',async()=>{await fails('PT404',()=>allocate(1000,randomUUID(),paid,line,1,other));await fails('PT404',()=>allocate(1000,randomUUID(),paid,randomUUID()));});
 await check('unverified funds cannot reduce installment',()=>fails('SH409',()=>allocate(1000,randomUUID(),unconfirmed)));
 const key=randomUUID();let first;
 await check('partial allocation updates both invoice and installment',async()=>{first=await allocate(2500,key);assert.equal(first.line_remaining_minor,1500);assert.equal(first.invoice_remaining_minor,7500);const r=await balances();assert.equal(r.lines[0].paid_minor,2500);assert.equal(r.lines[0].payment_state,'partial');assert.equal(r.requires_revision,false);});
 await check('same command replays exact receipt',async()=>assert.deepEqual(await allocate(2500,key),{...first,replayed:true}));
 await check('same key cannot change amount',()=>fails('SH410',()=>allocate(2000,key)));
 await check('line cap is independent of remaining invoice balance',()=>fails('SH409',()=>allocate(1501)));
 await rpc('record_local_payment_refund',[clinic,patient,paid,JSON.stringify({kind:'refund',amount_minor:1000,reason:'Correction fictive',reference:'DEMO-REFUND',effective_at:'2026-10-31T11:00:00Z',verified:true,releases:[{allocation_id:first.allocation_id,amount_minor:1000}]}),randomUUID(),gate]);
 await check('refund release restores only the linked installment balance',async()=>{const r=await balances();assert.equal(r.lines[0].paid_minor,1500);assert.equal(r.lines[0].remaining_minor,2500);assert.equal(r.lines[1].paid_minor,0);assert.equal(r.requires_revision,false);});
 await check('original receipt stays immutable after a refund',async()=>assert.deepEqual(await allocate(2500,key),{...first,replayed:true}));
 await allocate(2500);
 await check('fully covered installment is paid and no longer overdue',async()=>{const r=await balances();assert.equal(r.lines[0].payment_state,'paid');assert.equal(r.lines[0].overdue,false);assert.equal(r.lines[0].remaining_minor,0);});
 const revision={...body,plan_id:plan.plan_id,expected_version:1,invoices:[{invoice_id:target,deposit_minor:4000,credited_minor:0}],lines:[{invoice_id:target,due_on:'2099-01-01',amount_minor:6000}]};
 await rpc('save_local_installment_draft',[clinic,patient,JSON.stringify(revision),randomUUID(),gate]);await accept(2);
 await check('new accepted version excludes baseline deposits without rewriting old lines',async()=>{const old=await balances(),next=await balances(2);assert.equal(old.active,false);assert.equal(old.lines[0].paid_minor,4000);assert.equal(next.lines[0].amount_minor,6000);assert.equal(next.lines[0].paid_minor,0);assert.equal(next.requires_revision,false);await fails('SH409',()=>allocate(1000));});
 const next=(await balances(2)).lines[0];
 await check('source payment cannot be overallocated',()=>fails('SH409',()=>allocate(6000,randomUUID(),paid,next.line_id,2)));
 const standaloneKey=randomUUID();await rpc('allocate_local_payment',[clinic,patient,paid,target,1000,standaloneKey,gate]);
 await check('outside allocation marks terms for revision rather than silently distributing',async()=>{const r=await balances(2);assert.equal(r.requires_revision,true);assert.equal(r.lines[0].paid_minor,0);assert.equal(r.invoices[0].invoice_remaining_minor,5000);await fails('SH409',()=>allocate(1000,randomUUID(),paid,next.line_id,2));});
 const otherBody={...body,invoices:[{invoice_id:second,deposit_minor:0,credited_minor:0}],lines:[{invoice_id:second,due_on:'2099-01-01',amount_minor:10000}]};
 const otherPlan=await rpc('save_local_installment_draft',[clinic,patient,JSON.stringify(otherBody),randomUUID(),gate]);for(const action of ['approved','accepted'])await rpc('transition_local_installment_agreement',[clinic,patient,otherPlan.plan_id,1,action,'DEMO-AGREEMENT',randomUUID(),gate]);
 const otherLine=(await rpc('read_local_installment_version',[clinic,patient,otherPlan.plan_id,1,gate])).lines[0].line_id;
 await db.query('reset role');await db.query("create function private.qa_installment_allocation_outbox() returns trigger language plpgsql as $$ begin if new.event_type='LocalInstallmentPaymentAllocated' then raise exception 'Injected failure';end if;return new;end $$;create trigger qa_installment_allocation_outbox before insert on private.outbox_events for each row execute function private.qa_installment_allocation_outbox()");await db.query('set local role authenticated');
 await check('outbox failure rolls back underlying invoice allocation and installment link',()=>fails('P0001',()=>rpc('allocate_local_installment_payment',[clinic,patient,otherPlan.plan_id,1,otherLine,paid,1000,randomUUID(),gate])));
 await db.query('reset role');await db.query('drop trigger qa_installment_allocation_outbox on private.outbox_events;drop function private.qa_installment_allocation_outbox()');
 await check('only successful allocations have links and matching events',async()=>{for(const table of ['finance_installment_allocations','audit_events','outbox_events']){const extra=table==='audit_events'?" and action='LocalInstallmentPaymentAllocated'":table==='outbox_events'?" and event_type='LocalInstallmentPaymentAllocated'":'';assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1'+extra,[clinic])).rows[0].n,2);}});
 await check('allocation links cannot be changed',()=>fails('55000',()=>db.query('delete from private.finance_installment_allocations where clinic_id=$1',[clinic])));
 await db.query("update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2",[clinic,actor]);await db.query('set local role authenticated');
 await check('revoked membership cannot replay allocation or read balances',async()=>{await fails('42501',()=>allocate(2500,key));await fails('42501',()=>balances());});
 await db.query('reset role');await db.query('set local role anon');await check('anonymous cannot read balances',()=>fails('42501',()=>balances()));
 console.log(checks+' native installment allocation checks passed; fixture and candidate migration rolled back.');
}finally{await db.query('rollback');await db.end();}
