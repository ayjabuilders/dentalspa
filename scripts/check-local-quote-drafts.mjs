import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const clinic='10000000-0000-4000-8000-000000000001',patient='20000000-0000-4000-8000-000000000001';
const service=randomUUID(),gate=randomUUID(),key=randomUUID();let checks=0;
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
async function fails(code,fn){await db.query('savepoint expected_failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint expected_failure');assert.equal(error?.code,code);}
await db.connect();
try{
  await db.query('begin');
  if(!(await db.query("select to_regclass('private.finance_draft_gates') is not null present")).rows[0].present){
    const migration=readFileSync(new URL('../supabase/migrations/20261031110824_local_quote_drafts.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
    await db.query(migration);
  }
  if(!(await db.query("select to_regprocedure('public.revise_local_quote_draft(uuid,uuid,uuid,integer,jsonb,uuid,text)') is not null present")).rows[0].present){
    await db.query(readFileSync(new URL('../supabase/migrations/20261031111906_local_quote_revisions.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
  }
  if(!(await db.query("select to_regprocedure('private.quote_version_projection(uuid,uuid,integer)') is not null present")).rows[0].present){
    await db.query(readFileSync(new URL('../supabase/migrations/20261031112214_quote_history_projection.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
  }
  const actor=(await db.query("select user_id from public.clinic_memberships where clinic_id=$1 and role='manager' and active limit 1",[clinic])).rows[0]?.user_id;
  assert.ok(actor,'Synthetic manager required');
  await db.query("insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2) on conflict(clinic_id) do update set enabled=true,api_gate_key=$2",[clinic,gate]);
  await db.query("insert into private.finance_catalog_services(clinic_id,id,service_code,service_name) values($1,$2,$3,'Prestation test fictive')",[clinic,service,`TEST-${service}`]);
  await db.query("insert into private.finance_catalog_price_versions(clinic_id,service_id,version,unit_amount_minor,currency_code,effective_from,created_by) values($1,$2,1,1750,'MAD',now()-interval '1 day',$3)",[clinic,service,actor]);
  const payload={lines:[{service_id:service,price_version:1,quantity:3}]};
  const create=async(body=payload,requestKey=key,patientId=patient,gateKey=gate)=>(await db.query('select public.create_local_quote_draft($1,$2,$3::jsonb,$4,$5) r',[clinic,patientId,JSON.stringify(body),requestKey,gateKey])).rows[0].r;
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  await check('catalog returns pinned active synthetic price',async()=>{
    const catalog=(await db.query('select public.read_local_quote_catalog($1,$2) r',[clinic,gate])).rows[0].r;
    assert.equal(catalog.synthetic_only,true);assert.equal(catalog.items.find(s=>s.service_id===service).unit_amount_minor,1750);
  });
  let receipt;
  await check('draft calculates server total',async()=>{receipt=await create();assert.equal(receipt.total_minor,5250);assert.equal(receipt.state,'draft');assert.equal(receipt.patient_id,patient);});
  await check('identical retry replays immutable receipt',async()=>assert.deepEqual(await create(),{...receipt,replayed:true}));
  await check('same key with changed quantity conflicts',()=>fails('SH410',()=>create({lines:[{...payload.lines[0],quantity:4}]})));
  await check('same key cannot target a different patient',()=>fails('SH410',()=>create(payload,key,'20000000-0000-4000-8000-000000000002')));
  await check('foreign patient denied',()=>fails('PT404',()=>create(payload,randomUUID(),'20000000-0000-4000-8000-000000000004')));
  await check('caller cannot submit prices',()=>fails('22023',()=>create({lines:[{...payload.lines[0],unit_amount_minor:1}]},randomUUID())));
  await check('duplicate services rejected',()=>fails('22023',()=>create({lines:[payload.lines[0],payload.lines[0]]},randomUUID())));
  await check('UUID case does not bypass duplicate service validation',()=>fails('22023',()=>create({lines:[payload.lines[0],{...payload.lines[0],service_id:service.toUpperCase()}]},randomUUID())));
  await check('fractional quantity rejected',()=>fails('22023',()=>create({lines:[{...payload.lines[0],quantity:1.5}]},randomUUID())));
  await check('unknown service denied',()=>fails('PT404',()=>create({lines:[{...payload.lines[0],service_id:randomUUID()}]},randomUUID())));
  await check('wrong capability denied even for replay',()=>fails('PT503',()=>create(payload,key,patient,randomUUID())));
  await check('direct private tables inaccessible',()=>fails('42501',()=>db.query('select * from private.finance_draft_commands')));
  await db.query('reset role');
  await check('single immutable quote snapshot and minimal events',async()=>{
    assert.equal((await db.query('select count(*)::int n from private.finance_quote_lines where quote_id=$1',[receipt.quote_id])).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from private.finance_draft_commands where request_key=$1',[key])).rows[0].n,1);
    const events=(await db.query('select payload from private.outbox_events where correlation_id=$1',[key])).rows;
    assert.deepEqual(events.map(e=>e.payload),[{quote_version:1,synthetic_only:true}]);
    assert.equal((await db.query('select count(*)::int n from private.audit_events where correlation_id=$1',[key])).rows[0].n,1);
  });
  const revisionKey=randomUUID(),revisionPayload={lines:[{...payload.lines[0],quantity:4}]};let revised;
  const revise=async(body=revisionPayload,requestKey=revisionKey,version=1,patientId=patient,quoteId=receipt.quote_id)=>(await db.query('select public.revise_local_quote_draft($1,$2,$3,$4,$5::jsonb,$6,$7) r',[clinic,patientId,quoteId,version,JSON.stringify(body),requestKey,gate])).rows[0].r;
  await db.query('set local role authenticated');
  await check('revision appends version2 to the same quote',async()=>{revised=await revise();assert.equal(revised.quote_id,receipt.quote_id);assert.equal(revised.version,2);assert.equal(revised.total_minor,7000);});
  await check('revision replay is immutable',async()=>assert.deepEqual(await revise(),{...revised,replayed:true}));
  await check('patient hub projects exact historical quote snapshots',async()=>{
    const hub=(await db.query('select public.read_patient_hub($1,$2) r',[clinic,patient])).rows[0].r;
    const quote=hub.quotes.find(q=>q.id===receipt.quote_id);
    assert.equal(quote.version,2);assert.equal(quote.total_minor,7000);assert.equal(quote.history.length,1);
    assert.equal(quote.history[0].version,1);assert.equal(quote.history[0].total_minor,5250);
    assert.equal(quote.history[0].details.lines[0].quantity,3);assert.equal(quote.details.lines[0].quantity,4);
    assert.equal(quote.details.lines[0].service_id,service);
  });
  await check('stale revision rejects another command',()=>fails('SH409',()=>revise(revisionPayload,randomUUID())));
  await check('revision key cannot change lines',()=>fails('SH410',()=>revise(payload)));
  await check('create key cannot be reused for revision',()=>fails('SH410',()=>revise(revisionPayload,key)));
  await check('revision cannot reassign quote patient',()=>fails('PT404',()=>revise(revisionPayload,randomUUID(),2,'20000000-0000-4000-8000-000000000002')));
  await check('unknown quote does not leak data',()=>fails('PT404',()=>revise(revisionPayload,randomUUID(),1,patient,randomUUID())));
  await check('private save kernel cannot be called directly',()=>fails('42501',()=>db.query('select private.save_local_quote_draft($1,$2,$3::jsonb,$4,$5,null,null)',[clinic,patient,JSON.stringify(payload),randomUUID(),gate])));
  await db.query('reset role');
  await check('old version and original receipt unchanged',async()=>{
    const versions=(await db.query('select version,total_minor::text from private.finance_quote_versions where clinic_id=$1 and quote_id=$2 order by version',[clinic,receipt.quote_id])).rows;
    assert.deepEqual(versions,[{version:1,total_minor:'5250'},{version:2,total_minor:'7000'}]);
    assert.equal((await db.query('select receipt from private.finance_draft_commands where request_key=$1',[key])).rows[0].receipt.version,1);
    const events=(await db.query('select event_type,payload from private.outbox_events where correlation_id=$1',[revisionKey])).rows;
    assert.deepEqual(events,[{event_type:'LocalQuoteDraftRevised',payload:{quote_version:2,synthetic_only:true}}]);
  });
  await db.query("insert into private.finance_catalog_price_versions(clinic_id,service_id,version,unit_amount_minor,currency_code,effective_from,created_by) values($1,$2,2,1800,'MAD',now(),$3)",[clinic,service,actor]);
  await db.query('set local role authenticated');
  await check('new command with stale price conflicts',()=>fails('SH409',()=>create(payload,randomUUID())));
  await check('committed receipt still replays after price change',async()=>assert.deepEqual(await create(),{...receipt,replayed:true}));
  await db.query('reset role');
  await db.query('savepoint revocation');await db.query('update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2',[clinic,actor]);await db.query('set local role authenticated');
  await check('revoked membership cannot replay',()=>fails('42501',()=>create()));await db.query('rollback to savepoint revocation');
  await db.query('savepoint gate_off');await db.query('update private.finance_draft_gates set enabled=false where clinic_id=$1',[clinic]);await db.query('set local role authenticated');
  await check('disabled gate denies replay',()=>fails('PT503',()=>create()));await db.query('rollback to savepoint gate_off');
  await db.query("create function private.quote_test_outbox_failure() returns trigger language plpgsql as $$ begin if new.event_type in ('LocalQuoteDraftCreated','LocalQuoteDraftRevised') then raise exception using errcode='P0001',message='synthetic failure'; end if; return new; end $$");
  await db.query('create trigger quote_test_outbox_failure before insert on private.outbox_events for each row execute function private.quote_test_outbox_failure()');
  const before=(await db.query('select count(*)::int n from private.finance_quotes')).rows[0].n;
  await db.query('set local role authenticated');
  await check('outbox failure rolls back financial write',()=>fails('P0001',()=>create({lines:[{...payload.lines[0],price_version:2}]},randomUUID())));
  await check('outbox failure rolls back new revision',()=>fails('P0001',()=>revise({lines:[{...payload.lines[0],price_version:2}]},randomUUID(),2)));
  await db.query('reset role');assert.equal((await db.query('select count(*)::int n from private.finance_quotes')).rows[0].n,before);
  assert.equal((await db.query('select max(version) version from private.finance_quote_versions where clinic_id=$1 and quote_id=$2',[clinic,receipt.quote_id])).rows[0].version,2);
  await db.query('set local role anon');await check('anonymous RPC execution denied',()=>fails('42501',()=>create()));
  console.log(`${checks} native quote draft checks passed; transaction rolled back.`);
}finally{await db.query('rollback');await db.end();}
