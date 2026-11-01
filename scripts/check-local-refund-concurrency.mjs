import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {setTimeout as delay} from 'node:timers/promises';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
const clinic=randomUUID(),patient=randomUUID(),other=randomUUID(),account=randomUUID(),gate=randomUUID();let checks=0,committed=false;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
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


 const method=await rpc('save_local_payment_method',[clinic,JSON.stringify({method_id:null,expected_version:0,code:'CASH',label:'Espèces QA',kind:'cash',active:true,reference_required:false,settlement_behavior:'at_confirmation',receiving_account_id:account}),randomUUID(),gate]);
 async function payment(){const p=await rpc('record_local_payment',[clinic,patient,JSON.stringify({method_id:method.method_id,method_version:1,amount_minor:10000,currency_code:'MAD',effective_at:'2026-10-30T10:00:00Z',reference:'DEMO-QA'}),randomUUID(),gate]);await rpc('transition_local_payment',[clinic,patient,p.payment_id,1,'confirm',true,randomUUID(),gate]);return p.payment_id;}
 const payments=[],invoices=[],allocations=[];
 for(let n=0;n<4;n++){payments.push(await payment());invoices.push(await invoice(1));if(n<2)allocations.push((await rpc('allocate_local_payment',[clinic,patient,payments[n],invoices[n],10000,randomUUID(),gate])).allocation_id);}
 await db.query('reset role');await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,refund_allowed) values($1,$2,true)',[clinic,actor]);await db.query('commit');committed=true;
 const refundSQL='select public.record_local_payment_refund($1,$2,$3,$4::jsonb,$5,$6) r',allocateSQL='select public.allocate_local_payment($1,$2,$3,$4,$5,$6,$7) r';
 const refundArgs=(index,amount,key=randomUUID())=>[clinic,patient,payments[index],JSON.stringify({kind:'refund',amount_minor:amount,reason:'Course fictive vérifiée',reference:'DEMO-RACE',effective_at:'2026-10-31T10:00:00Z',verified:true,releases:index<2?[{allocation_id:allocations[index],amount_minor:amount}]:[]}),key,gate];
 async function race(name,sqlA,argsA,sqlB,argsB,replay=false){const config={host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',statement_timeout:15000},a=new pg.Client(config),b=new pg.Client(config);let pending;
  try{for(const c of [a,b]){await c.connect();await c.query('begin');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await c.query('set local role authenticated');}const first=(await a.query(sqlA,argsA)).rows[0].r,pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;pending=b.query(sqlB,argsB).then(result=>({result}),error=>({error}));let waiting=false;for(let n=0;n<80;n++){waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;if(waiting)break;await delay(25);}assert.equal(waiting,true,'Second command must block on real database lock');await a.query('commit');const second=await pending;if(replay){assert.deepEqual(second.result?.rows[0].r,{...first,replayed:true});await b.query('commit');}else{assert.equal(second.error?.code,'SH409');await b.query('rollback');}checks++;console.log('PASS '+name);
  }finally{await a.query('rollback').catch(()=>undefined);if(pending)await pending;await b.query('rollback').catch(()=>undefined);await Promise.all([a.end(),b.end()]);}}
 await race('two refunds cannot consume the same allocated funds',refundSQL,refundArgs(0,6000),refundSQL,refundArgs(0,6000));
 const key=randomUUID();await race('concurrent identical refund produces one release and receipt',refundSQL,refundArgs(1,5000,key),refundSQL,refundArgs(1,5000,key),true);
 await race('refund wins before competing allocation',refundSQL,refundArgs(2,7000),allocateSQL,[clinic,patient,payments[2],invoices[2],7000,randomUUID(),gate]);
 await race('allocation wins before competing unapplied refund',allocateSQL,[clinic,patient,payments[3],invoices[3],7000,randomUUID(),gate],refundSQL,refundArgs(3,7000));
 await check('winning refunds have exact totals and single audit/outbox events',async()=>{assert.equal((await db.query('select count(*)::int n,sum(amount_minor)::int total from private.finance_payment_refunds where clinic_id=$1',[clinic])).rows[0].n,3);assert.equal((await db.query('select sum(amount_minor)::int total from private.finance_payment_refunds where clinic_id=$1',[clinic])).rows[0].total,18000);assert.equal((await db.query('select count(*)::int n from private.finance_allocation_releases where clinic_id=$1',[clinic])).rows[0].n,2);for(const table of ['audit_events','outbox_events'])assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1 and '+(table==='audit_events'?'action':'event_type')+"='LocalPaymentRefundVerified'",[clinic])).rows[0].n,3);});
 console.log(checks+' native refund race checks passed.');
}finally{
 await db.query('rollback');if(committed){await db.query('begin');await db.query("set local session_replication_role='replica'");
 for(const table of ['finance_allocation_releases','finance_payment_refunds','local_finance_correction_permissions','finance_payment_receipts','finance_payment_receipt_counters','finance_payment_allocations','finance_payment_commands','finance_payment_events','finance_payments','local_payment_settings','finance_payment_method_commands','finance_payment_method_versions','finance_payment_methods','finance_receiving_accounts','finance_invoice_commands','finance_issued_invoices','finance_invoice_drafts','finance_invoice_counters','local_invoice_settings','finance_draft_commands','finance_quote_lines','finance_quote_versions','finance_quotes','finance_catalog_commands','finance_catalog_price_versions','finance_catalog_services','finance_draft_gates','audit_events','outbox_events'])await db.query('delete from private.'+table+' where clinic_id=$1',[clinic]);await db.query('delete from public.clinic_memberships where clinic_id=$1',[clinic]);await db.query('delete from public.patients where clinic_id=$1',[clinic]);await db.query('delete from public.clinics where id=$1',[clinic]);await db.query('commit');}
 await db.end();console.log('Isolated refund race fixtures removed; owner data unchanged.');
}
