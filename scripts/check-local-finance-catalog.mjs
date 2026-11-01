import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const clinic='10000000-0000-4000-8000-000000000001',patient='20000000-0000-4000-8000-000000000001',gate=randomUUID(),key=randomUUID();let checks=0;
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
async function fails(code,fn){await db.query('savepoint expected_failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint expected_failure');assert.equal(error?.code,code);}
await db.connect();try{
  await db.query('begin');
  if(!(await db.query("select to_regclass('private.finance_catalog_commands') is not null present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261031112846_local_finance_catalog.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
  const actor=(await db.query("select user_id from public.clinic_memberships where clinic_id=$1 and active and role='manager' limit 1",[clinic])).rows[0].user_id;
  await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2) on conflict(clinic_id) do update set enabled=true,api_gate_key=$2',[clinic,gate]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  const body={service_id:null,expected_version:0,code:`TEST-${randomUUID().toUpperCase()}`,label:'Prestation fictive test',category:'TEST',unit_amount_minor:10000,archived:false};
  const save=async(payload=body,requestKey=key,clinicId=clinic,capability=gate)=>(await db.query('select public.save_local_finance_service($1,$2::jsonb,$3,$4) r',[clinicId,JSON.stringify(payload),requestKey,capability])).rows[0].r;
  const catalog=async()=>(await db.query('select public.read_local_finance_catalog($1,$2) r',[clinic,gate])).rows[0].r;
  const choices=async()=>(await db.query('select public.read_local_quote_catalog($1,$2) r',[clinic,gate])).rows[0].r.items;
  let created,changed;
  await check('creates versioned catalogue service',async()=>{created=await save();assert.equal(created.price_version,1);assert.equal(created.unit_amount_minor,10000);assert.equal(created.currency_code,'MAD');});
  await check('exact key replay has no second service',async()=>assert.deepEqual(await save(),{...created,replayed:true}));
  await check('changed payload conflicts on key',()=>fails('SH410',()=>save({...body,unit_amount_minor:12000})));
  await check('same code conflicts without duplicate',()=>fails('SH409',()=>save(body,randomUUID())));
  await check('negative and fractional money rejected',async()=>{for(const amount of [-1,1.5,0])await fails('22023',()=>save({...body,unit_amount_minor:amount},randomUUID()));});
  await check('extra financial policy fields rejected',()=>fails('22023',()=>save({...body,tax_rate:20},randomUUID())));
  const quote=(await db.query('select public.create_local_quote_draft($1,$2,$3::jsonb,$4,$5) r',[clinic,patient,JSON.stringify({lines:[{service_id:created.service_id,price_version:1,quantity:3}]}),randomUUID(),gate])).rows[0].r;
  const update={...body,service_id:created.service_id,expected_version:1,label:'Prestation fictive modifiée',unit_amount_minor:12000};
  await check('update appends price version2',async()=>{changed=await save(update,randomUUID());assert.equal(changed.service_id,created.service_id);assert.equal(changed.price_version,2);assert.equal(changed.unit_amount_minor,12000);});
  await check('stale service edit conflicts',()=>fails('SH409',()=>save(update,randomUUID())));
  await check('unknown service is unavailable',()=>fails('PT404',()=>save({...update,service_id:randomUUID()},randomUUID())));
  await check('foreign clinic access denied',()=>fails('42501',()=>save(body,randomUUID(),randomUUID())));
  await check('invalid capability denied',()=>fails('PT503',()=>save(body,key,clinic,randomUUID())));
  await check('catalogue returns new price while old quote remains fixed',async()=>{
    const item=(await catalog()).items.find(item=>item.service_id===created.service_id);assert.equal(item.price_version,2);assert.equal(item.label,update.label);
    const hub=(await db.query('select public.read_patient_hub($1,$2) r',[clinic,patient])).rows[0].r;
    const saved=hub.quotes.find(item=>item.id===quote.quote_id);assert.equal(saved.total_minor,30000);assert.equal(saved.details.lines[0].label,body.label);assert.equal(saved.details.lines[0].unit_amount_minor,10000);
  });
  await check('quote with old catalogue version conflicts',()=>fails('SH409',()=>db.query('select public.create_local_quote_draft($1,$2,$3::jsonb,$4,$5)',[clinic,patient,JSON.stringify({lines:[{service_id:created.service_id,price_version:1,quantity:1}]}),randomUUID(),gate])));
  await check('archive removes service from new quote choices but keeps admin record',async()=>{
    await save({...update,expected_version:2,archived:true},randomUUID());
    assert.ok(!(await choices()).some(item=>item.service_id===created.service_id));assert.equal((await catalog()).items.find(item=>item.service_id===created.service_id).archived,true);
  });
  await check('restore appends a new version',async()=>{const restored=await save({...update,expected_version:3,archived:false},randomUUID());assert.equal(restored.price_version,4);assert.ok((await choices()).some(item=>item.service_id===created.service_id));});
  await check('private command table denied',()=>fails('42501',()=>db.query('select * from private.finance_catalog_commands')));
  await db.query('reset role');
  await check('history immutable and metadata snapshots audited',async()=>{
    assert.deepEqual((await db.query('select version,unit_amount_minor::text amount from private.finance_catalog_price_versions where clinic_id=$1 and service_id=$2 order by version',[clinic,created.service_id])).rows,[{version:1,amount:'10000'},{version:2,amount:'12000'},{version:3,amount:'12000'},{version:4,amount:'12000'}]);
    assert.equal((await db.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and aggregate_id=$2 and event_type='LocalFinanceServiceSaved'",[clinic,created.service_id])).rows[0].n,4);
  });
  await db.query("create function private.catalog_test_failure() returns trigger language plpgsql as $$ begin if new.event_type='LocalFinanceServiceSaved' then raise exception using errcode='P0001',message='synthetic failure'; end if; return new; end $$");
  await db.query('create trigger catalog_test_failure before insert on private.outbox_events for each row execute function private.catalog_test_failure()');
  await db.query('set local role authenticated');
  await check('outbox failure rolls back service edit and price snapshot',()=>fails('P0001',()=>save({...update,expected_version:4,label:'Must not persist'},randomUUID())));
  assert.equal((await catalog()).items.find(item=>item.service_id===created.service_id).price_version,4);
  await db.query('reset role');await db.query('savepoint revoke');await db.query('update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2',[clinic,actor]);await db.query('set local role authenticated');
  await check('revoked actor cannot replay',()=>fails('42501',()=>save()));await db.query('rollback to savepoint revoke');
  await db.query('set local role anon');await check('anonymous RPC denied',()=>fails('42501',()=>catalog()));
  console.log(`${checks} native catalogue checks passed; all fixture changes rolled back.`);
}finally{await db.query('rollback');await db.end();}
