import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// Loopback only. Uses an unused synthetic invoice series and removes only its fixtures.
const config={host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres',statement_timeout:15000};
const clinic='10000000-0000-4000-8000-000000000001',patient='20000000-0000-4000-8000-000000000001';
const series='DEMO-'+randomUUID().slice(0,8).toUpperCase();
const db=new pg.Client(config),a=new pg.Client(config),b=new pg.Client(config);
const invoices=[],quotes=[],keys=[];let actor,gate,service,installed=false;
const key=()=>{const value=randomUUID();keys.push(value);return value;};
const issueSql='select public.issue_local_invoice($1,$2,$3,$4,$5) r';
async function begin(connection){await connection.query('begin');await connection.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await connection.query('set local role authenticated');}
async function race(firstId,secondId,firstKey,secondKey){
  let pending;
  try{
    await begin(a);await begin(b);
    const first=(await a.query(issueSql,[clinic,patient,firstId,firstKey,gate])).rows[0].r;
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    pending=b.query(issueSql,[clinic,patient,secondId,secondKey,gate]).then(result=>({result}),error=>({error}));
    let waiting=false;
    for(let n=0;n<80;n++){
      waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;
      if(waiting)break;await delay(25);
    }
    assert.equal(waiting,true,'Second session must actually contend before first commits');
    await a.query('commit');const second=await pending;
    if(second.error){await b.query('rollback');return {first,error:second.error};}
    await b.query('commit');return {first,second:second.result.rows[0].r};
  }finally{
    await a.query('rollback').catch(()=>undefined);
    if(pending)await pending;
    await b.query('rollback').catch(()=>undefined);
  }
}
await db.connect();await a.connect();await b.connect();
try{
  await db.query('begin');
  // Never overwrite an enabled owner's configuration: require an unused invoice setup.
  assert.equal((await db.query('select count(*)::int n from private.local_invoice_settings where clinic_id=$1',[clinic])).rows[0].n,0,'Existing invoice setup: use dedicated fixture instead');
  const authorization=(await db.query('select api_gate_key from private.finance_draft_gates where clinic_id=$1 and enabled and synthetic_only',[clinic])).rows[0];assert.ok(authorization);gate=authorization.api_gate_key;
  actor=(await db.query("select user_id from public.clinic_memberships where clinic_id=$1 and role='manager' and active limit 1",[clinic])).rows[0]?.user_id;assert.ok(actor);
  await db.query('insert into private.local_invoice_settings(clinic_id,drafts_enabled,issuance_enabled,series_code) values($1,true,true,$2)',[clinic,series]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  service=(await db.query('select public.save_local_finance_service($1,$2::jsonb,$3,$4) r',[clinic,JSON.stringify({service_id:null,expected_version:0,code:'QA-'+randomUUID().toUpperCase(),label:'Concurrence facture FICTIF',category:null,unit_amount_minor:10000,archived:false}),key(),gate])).rows[0].r.service_id;
  for(let n=0;n<4;n++){
    const quote=(await db.query('select public.create_local_quote_draft($1,$2,$3::jsonb,$4,$5) r',[clinic,patient,JSON.stringify({lines:[{service_id:service,price_version:1,quantity:n+1}]}),key(),gate])).rows[0].r;
    quotes.push(quote.quote_id);
    const draft=(await db.query('select public.prepare_local_invoice($1,$2,$3,1,$4,$5) r',[clinic,patient,quote.quote_id,key(),gate])).rows[0].r;
    invoices.push(draft.invoice_id);
  }
  await db.query('commit');installed=true;
  const different=await race(invoices[0],invoices[1],key(),key());
  assert.equal(different.first.number,series+'-1');assert.equal(different.second.number,series+'-2');
  console.log('PASS two invoices contend on series: distinct consecutive numbers');
  const replayKey=key(),same=await race(invoices[2],invoices[2],replayKey,replayKey);
  assert.equal(same.first.number,series+'-3');assert.deepEqual(same.second,{...same.first,replayed:true});
  console.log('PASS concurrent exact retry: one number and identical receipt');
  const competing=await race(invoices[3],invoices[3],key(),key());
  assert.equal(competing.first.number,series+'-4');assert.equal(competing.error?.code,'SH409');
  console.log('PASS competing keys for same invoice: one winner, one conflict');
  assert.equal((await db.query('select next_number::int n from private.finance_invoice_counters where clinic_id=$1 and series_code=$2',[clinic,series])).rows[0].n,5);
  for(const table of ['audit_events','outbox_events']){
    const field=table==='audit_events'?'action':'event_type';
    assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1 and aggregate_id=any($2::uuid[]) and '+field+"='LocalInvoiceIssued'",[clinic,invoices])).rows[0].n,4);
  }
  console.log('PASS four issued invoices, four audit/outbox events, no extra number consumed');
}finally{
  await db.query('rollback');
  if(installed){
    await db.query('begin');await db.query("set local session_replication_role='replica'");
    for(const table of ['audit_events','outbox_events'])await db.query('delete from private.'+table+' where clinic_id=$1 and aggregate_id=any($2::uuid[])',[clinic,[...invoices,...quotes,service]]);
    for(const table of ['finance_invoice_commands','finance_draft_commands','finance_catalog_commands'])await db.query('delete from private.'+table+' where clinic_id=$1 and actor_ref=$2 and request_key=any($3::uuid[])',[clinic,actor,keys]);
    await db.query('delete from private.finance_issued_invoices where clinic_id=$1 and invoice_id=any($2::uuid[])',[clinic,invoices]);
    await db.query('delete from private.finance_invoice_drafts where clinic_id=$1 and id=any($2::uuid[])',[clinic,invoices]);
    for(const table of ['finance_quote_lines','finance_quote_versions'])await db.query('delete from private.'+table+' where clinic_id=$1 and quote_id=any($2::uuid[])',[clinic,quotes]);
    await db.query('delete from private.finance_quotes where clinic_id=$1 and id=any($2::uuid[])',[clinic,quotes]);
    await db.query('delete from private.finance_catalog_price_versions where clinic_id=$1 and service_id=$2',[clinic,service]);
    await db.query('delete from private.finance_catalog_services where clinic_id=$1 and id=$2',[clinic,service]);
    await db.query('delete from private.finance_invoice_counters where clinic_id=$1 and series_code=$2',[clinic,series]);
    await db.query('delete from private.local_invoice_settings where clinic_id=$1 and series_code=$2',[clinic,series]);
    await db.query('commit');console.log('Synthetic concurrency fixtures removed; invoice issuance remains disabled.');
  }
  await Promise.all([a.end(),b.end(),db.end()]);
}
