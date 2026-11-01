import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
// Fixed loopback target; committed fixtures are isolated by a fresh clinic UUID.
const config={host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',statement_timeout:15000};
const db=new pg.Client(config),clinic=randomUUID(),patient=randomUUID(),other=randomUUID(),account=randomUUID(),gate=randomUUID();
let committed=false,checks=0;
await db.connect();try{
 await db.query('begin');
 assert.ok((await db.query("select to_regclass('private.finance_installment_plans') present")).rows[0].present,'Apply installment migration locally first');
 const actor=(await db.query("select user_id from public.clinic_memberships where active and role='manager' limit 1")).rows[0].user_id;
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
 const invoices=[];for(let n=0;n<5;n++)invoices.push(await invoice(1));
 const method=await rpc('save_local_payment_method',[clinic,JSON.stringify({method_id:null,expected_version:0,code:'CASH',label:'Espèces QA',kind:'cash',active:true,reference_required:false,settlement_behavior:'at_confirmation',receiving_account_id:account}),randomUUID(),gate]);
 const payment=await rpc('record_local_payment',[clinic,patient,JSON.stringify({method_id:method.method_id,method_version:1,amount_minor:1000,currency_code:'MAD',effective_at:'2026-10-31T10:00:00Z',reference:'DEMO-RACE'}),randomUUID(),gate]);
 await rpc('transition_local_payment',[clinic,patient,payment.payment_id,1,'confirm',true,randomUUID(),gate]);
 await db.query('reset role');await db.query('insert into private.local_installment_settings(clinic_id,enabled) values($1,true)',[clinic]);
 await db.query('commit');committed=true;
 const saveSQL='select public.save_local_installment_draft($1,$2,$3::jsonb,$4,$5) r';
 const transitionSQL='select public.transition_local_installment_agreement($1,$2,$3,$4,$5,$6,$7,$8) r';
 const terms=(index,plan=null,version=0)=>({plan_id:plan,expected_version:version,reason:'Calendrier fictif QA',invoices:[{invoice_id:invoices[index],deposit_minor:0,credited_minor:0}],lines:[{invoice_id:invoices[index],due_on:'2027-01-15',amount_minor:10000}]});
 const saveArgs=(body,key=randomUUID())=>[clinic,patient,JSON.stringify(body),key,gate];
 const transitionArgs=(plan,version,action,key=randomUUID())=>[clinic,patient,plan,version,action,'DEMO-RACE',key,gate];
 async function command(sql,args){await db.query('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');const r=(await db.query(sql,args)).rows[0].r;await db.query('commit');return r;}catch(e){await db.query('rollback');throw e;}}
 async function race(name,sqlA,argsA,sqlB,argsB,expected='SH409'){
  const a=new pg.Client(config),b=new pg.Client(config);let pending;
  try{for(const c of [a,b]){await c.connect();await c.query('begin');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await c.query('set local role authenticated');}
   const first=(await a.query(sqlA,argsA)).rows[0].r,pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
   pending=b.query(sqlB,argsB).then(result=>({result}),error=>({error}));
   let blocked=false;for(let n=0;n<100;n++){blocked=(await db.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[pid])).rows[0]?.blocked;if(blocked)break;await delay(25);}assert.ok(blocked,'Expected an actual competing database lock');
   await a.query('commit');const second=await pending;
   if(expected==='replay'){assert.deepEqual(second.result?.rows[0].r,{...first,replayed:true});await b.query('commit');}
   else if(expected==='success'){assert.equal(second.error,undefined);await b.query('commit');}
   else{assert.equal(second.error?.code,expected);await b.query('rollback');}
   checks++;console.log('PASS '+name);return first;
  }finally{await a.query('rollback').catch(()=>undefined);if(pending)await pending;await b.query('rollback').catch(()=>undefined);await Promise.all([a.end(),b.end()]);}
 }
 const first=await race('two new plans cannot claim the same invoice',saveSQL,saveArgs(terms(0)),saveSQL,saveArgs(terms(0)));
 const key=randomUUID();await race('same creation key returns one immutable receipt',saveSQL,saveArgs(terms(1),key),saveSQL,saveArgs(terms(1),key),'replay');
 await race('two revisions of version1 produce only version2',saveSQL,saveArgs(terms(0,first.plan_id,1)),saveSQL,saveArgs({...terms(0,first.plan_id,1),reason:'Competing change'}));
 const approve=transitionArgs(first.plan_id,2,'approved');await race('approval retry emits one event',transitionSQL,approve,transitionSQL,approve,'replay');
 await race('two acceptance commands have one winner',transitionSQL,transitionArgs(first.plan_id,2,'accepted'),transitionSQL,transitionArgs(first.plan_id,2,'accepted'));
 const plan3=await command(saveSQL,saveArgs(terms(2)));await command(transitionSQL,transitionArgs(plan3.plan_id,1,'approved'));
 await race('revision wins before stale acceptance',saveSQL,saveArgs(terms(2,plan3.plan_id,1)),transitionSQL,transitionArgs(plan3.plan_id,1,'accepted'));
 const plan4=await command(saveSQL,saveArgs(terms(3)));await command(transitionSQL,transitionArgs(plan4.plan_id,1,'approved'));
 await race('acceptance remains effective while a new revision is drafted',transitionSQL,transitionArgs(plan4.plan_id,1,'accepted'),saveSQL,saveArgs(terms(3,plan4.plan_id,1)),'success');
 const plan5=await command(saveSQL,saveArgs(terms(4)));
 await race('payment allocation invalidates simultaneous approval of old terms','select public.allocate_local_payment($1,$2,$3,$4,$5,$6,$7) r',[clinic,patient,payment.payment_id,invoices[4],1000,randomUUID(),gate],transitionSQL,transitionArgs(plan5.plan_id,1,'approved'));
 assert.equal((await db.query('select count(*)::int n from private.finance_installment_events where clinic_id=$1 and plan_id=$2',[clinic,plan5.plan_id])).rows[0].n,0);
 const pointers=(await db.query('select latest_version,accepted_version from private.finance_installment_plans where clinic_id=$1 and id=$2',[clinic,plan4.plan_id])).rows[0];assert.deepEqual(pointers,{latest_version:2,accepted_version:1});
 assert.equal((await db.query('select count(*)::int n from private.finance_installment_plans where clinic_id=$1',[clinic])).rows[0].n,5,'Failed creation must roll back its plan');
 assert.equal((await db.query('select count(*)::int n from private.finance_installment_versions where clinic_id=$1',[clinic])).rows[0].n,8);
 const commands=(await db.query('select count(*)::int n from private.finance_installment_commands where clinic_id=$1',[clinic])).rows[0].n;
 assert.equal(commands,13);for(const table of ['audit_events','outbox_events'])assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1 and '+(table==='audit_events'?'action':'event_type')+" like 'LocalInstallment%'",[clinic])).rows[0].n,commands);
 checks++;console.log('PASS exact persisted versions, accepted pointer, commands and audit/outbox counts');
 console.log(checks+' native installment concurrency checks passed.');
}finally{
 await db.query('rollback');if(committed){await db.query('begin');await db.query("set local session_replication_role='replica'");
 for(const table of ['finance_installment_commands','finance_installment_events','finance_installment_lines','finance_installment_versions','finance_installment_invoices','finance_installment_plans','local_installment_settings','finance_allocation_releases','finance_payment_refunds','local_finance_correction_permissions','finance_payment_receipts','finance_payment_receipt_counters','finance_payment_allocations','finance_payment_commands','finance_payment_events','finance_payments','local_payment_settings','finance_payment_method_commands','finance_payment_method_versions','finance_payment_methods','finance_receiving_accounts','finance_invoice_commands','finance_issued_invoices','finance_invoice_drafts','finance_invoice_counters','local_invoice_settings','finance_draft_commands','finance_quote_lines','finance_quote_versions','finance_quotes','finance_catalog_commands','finance_catalog_price_versions','finance_catalog_services','finance_draft_gates','audit_events','outbox_events'])await db.query('delete from private.'+table+' where clinic_id=$1',[clinic]);await db.query('delete from public.clinic_memberships where clinic_id=$1',[clinic]);await db.query('delete from public.patients where clinic_id=$1',[clinic]);await db.query('delete from public.clinics where id=$1',[clinic]);await db.query('commit');}
 await db.end();console.log('Isolated installment race fixtures removed; owner data unchanged.');
}
