import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const clinic='10000000-0000-4000-8000-000000000001',patient='20000000-0000-4000-8000-000000000001',gate=randomUUID(),prepareKey=randomUUID(),issueKey=randomUUID(),series='DEMO-'+randomUUID().slice(0,8).toUpperCase();let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
async function fails(code,fn){await db.query('savepoint expected_failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint expected_failure');assert.equal(error?.code,code);}
await db.connect();try{
  await db.query('begin');
  if(!(await db.query("select to_regclass('private.local_invoice_settings') is not null present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261031113938_local_invoice_foundation.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
  const actor=(await db.query("select user_id from public.clinic_memberships where clinic_id=$1 and active and role='manager' limit 1",[clinic])).rows[0].user_id;
  await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2) on conflict(clinic_id) do update set enabled=true,api_gate_key=$2',[clinic,gate]);
  await db.query('insert into private.local_invoice_settings(clinic_id,drafts_enabled,issuance_enabled,series_code) values($1,true,true,$2) on conflict(clinic_id) do update set drafts_enabled=true,issuance_enabled=true,series_code=$2',[clinic,series]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  const service=(await db.query('select public.save_local_finance_service($1,$2::jsonb,$3,$4) r',[clinic,JSON.stringify({service_id:null,expected_version:0,code:'QA-'+randomUUID().toUpperCase(),label:'Prestation facture fictive',category:null,unit_amount_minor:10000,archived:false}),randomUUID(),gate])).rows[0].r;
  const lines={lines:[{service_id:service.service_id,price_version:1,quantity:3}]};
  const quote=(await db.query('select public.create_local_quote_draft($1,$2,$3::jsonb,$4,$5) r',[clinic,patient,JSON.stringify(lines),randomUUID(),gate])).rows[0].r;
  const prepare=async(key=prepareKey,version=1,patientId=patient)=>(await db.query('select public.prepare_local_invoice($1,$2,$3,$4,$5,$6) r',[clinic,patientId,quote.quote_id,version,key,gate])).rows[0].r;
  let draft,issued;
  const issue=async(key=issueKey,id=draft.invoice_id,patientId=patient)=>(await db.query('select public.issue_local_invoice($1,$2,$3,$4,$5) r',[clinic,patientId,id,key,gate])).rows[0].r;
  await check('preparation creates an unnumbered synthetic draft',async()=>{draft=await prepare();assert.equal(draft.state,'draft');assert.equal(draft.total_minor,30000);assert.equal(draft.synthetic_only,true);assert.ok(!('number' in draft));});
  await check('preparation replays exact draft',async()=>assert.deepEqual(await prepare(),{...draft,replayed:true}));
  await check('new key cannot prepare same full quote twice',()=>fails('SH409',()=>prepare(randomUUID())));
  await check('foreign patient rejected',()=>fails('PT404',()=>prepare(randomUUID(),1,'20000000-0000-4000-8000-000000000004')));
  await check('invoice key cannot change patient',()=>fails('SH410',()=>prepare(prepareKey,1,'20000000-0000-4000-8000-000000000002')));
  await check('stale quote version rejected',()=>fails('SH409',()=>prepare(randomUUID(),2)));
  await db.query('reset role');await db.query('savepoint disabled');await db.query('update private.local_invoice_settings set issuance_enabled=false where clinic_id=$1',[clinic]);await db.query('set local role authenticated');
  await check('separate issuance switch is enforced',()=>fails('PT503',()=>issue()));await db.query('rollback to savepoint disabled');await db.query('set local role authenticated');
  await check('issue allocates one DEMO series number',async()=>{issued=await issue();assert.equal(issued.number,series+'-1');assert.equal(issued.state,'issued');assert.equal(issued.total_minor,30000);});
  await check('issue retry preserves number and time',async()=>assert.deepEqual(await issue(),{...issued,replayed:true}));
  await check('second issue key cannot allocate another number',()=>fails('SH409',()=>issue(randomUUID())));
  await check('prepare key cannot be used for issue',()=>fails('SH410',()=>issue(prepareKey)));
  await check('issue cannot target another patient',()=>fails('PT404',()=>issue(randomUUID(),draft.invoice_id,'20000000-0000-4000-8000-000000000002')));
  await db.query('select public.revise_local_quote_draft($1,$2,$3,1,$4::jsonb,$5,$6)',[clinic,patient,quote.quote_id,JSON.stringify({lines:[{...lines.lines[0],quantity:4}]}),randomUUID(),gate]);
  const secondDraft=await prepare(randomUUID(),2);
  await db.query('reset role');
  await check('issued snapshot stays unchanged after quote revision',async()=>{
    const saved=(await db.query('select snapshot,total_minor::text amount from private.finance_invoice_drafts where clinic_id=$1 and id=$2',[clinic,draft.invoice_id])).rows[0];
    assert.equal(saved.amount,'30000');assert.equal(saved.snapshot.quote.version,1);assert.equal(saved.snapshot.quote.details.lines[0].quantity,3);
    assert.equal(saved.snapshot.patient.id,patient);assert.equal(saved.snapshot.payer_basis,'patient_self_synthetic_fixture');assert.equal(saved.snapshot.synthetic_only,true);
  });
  await check('issued data and draft content reject mutations',async()=>{await fails('55000',()=>db.query("update private.finance_issued_invoices set number='changed' where clinic_id=$1 and invoice_id=$2",[clinic,draft.invoice_id]));await fails('55000',()=>db.query("update private.finance_invoice_drafts set snapshot='{}'::jsonb where clinic_id=$1 and id=$2",[clinic,draft.invoice_id]));});
  await db.query("create function private.invoice_test_failure() returns trigger language plpgsql as $$ begin if new.event_type='LocalInvoiceIssued' then raise exception using errcode='P0001',message='synthetic failure'; end if; return new; end $$");
  await db.query('create trigger invoice_test_failure before insert on private.outbox_events for each row execute function private.invoice_test_failure()');
  await db.query('set local role authenticated');
  await check('outbox failure rolls back issuance and number allocation',()=>fails('P0001',()=>issue(randomUUID(),secondDraft.invoice_id)));
  await db.query('reset role');assert.equal((await db.query('select next_number::text n from private.finance_invoice_counters where clinic_id=$1 and series_code=$2',[clinic,series])).rows[0].n,'2');
  await db.query('drop trigger invoice_test_failure on private.outbox_events');await db.query('set local role authenticated');
  await check('next successful invoice uses next unique number',async()=>assert.equal((await issue(randomUUID(),secondDraft.invoice_id)).number,series+'-2'));
  await check('private invoice table access denied',()=>fails('42501',()=>db.query('select * from private.finance_issued_invoices')));
  await db.query('reset role');
  await check('single event per issued invoice and no patient contents in outbox',async()=>{
    const events=(await db.query("select payload from private.outbox_events where clinic_id=$1 and aggregate_id=any($2::uuid[]) and event_type='LocalInvoiceIssued'",[clinic,[draft.invoice_id,secondDraft.invoice_id]])).rows;
    assert.deepEqual(events,[{payload:{synthetic_only:true}},{payload:{synthetic_only:true}}]);
  });
  await db.query('savepoint revoke');await db.query('update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2',[clinic,actor]);await db.query('set local role authenticated');
  await check('revoked manager cannot replay invoice issuance',()=>fails('42501',()=>issue()));await db.query('rollback to savepoint revoke');await db.query('set local role anon');
  await check('anonymous invoice RPC denied',()=>fails('42501',()=>prepare()));
  console.log(checks+' native invoice checks passed; all synthetic records and numbering rolled back.');
}finally{await db.query('rollback');await db.end();}
