// Full local PostgreSQL evidence only. Imports the unchanged worker, no external handler effects.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { OutboxWorker } from '../apps/dental-api/src/audit/worker/outbox-worker.ts';

function validateDatabaseUrl(value) {
  let url;
  try {url=new URL(value);}catch {throw new Error('Local Supabase status did not provide DB_URL.');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.port!=='54322'||url.pathname!=='/postgres'||url.username!=='postgres'||url.search||url.hash) throw new Error('Refusing connection outside the repository local PostgreSQL endpoint.');
  return url.toString();
}
function localDatabaseUrl() {
  let status;
  try {
    const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:1024*1024};
    const output=process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],options):execFileSync('pnpm',['exec','supabase','status','-o','json'],options);
    status=JSON.parse(output); // Never print status: unrelated API credentials are present.
  }catch {throw new Error('Local Supabase unavailable; start/reset the local stack before running outbox evidence.');}
  return validateDatabaseUrl(status?.DB_URL);
}
async function query(client,sql,params=[]) {
  try {return await client.query(sql,params);}
  catch(error) {const code=typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:'UNKNOWN';throw Object.assign(new Error(`Database operation failed (${code})`),{code});}
}
async function poll(label,check,timeout=10000) {
  const deadline=performance.now()+timeout;
  while(performance.now()<deadline) {if(await check()) return;await delay(20);}
  throw new Error(`Timed out waiting for ${label}`);
}
function gate(f) {
  let release;const ready=new Promise(resolve=>{release=resolve;});const timeout=delay(20000,null,{ref:false}).then(()=>{throw new Error('Bounded worker barrier timed out');});const promise=Promise.race([ready,timeout]);f.gates.push(release);return {promise,release};
}
function launch(f,operation) {
  const result=operation().then(value=>({ok:true,value}),error=>({ok:false,code:error.code??'UNKNOWN'}));f.pending.push(result);return result;
}

// A real transaction on one explicit connection. Hooks expose boundaries; they do not replace SQL.
function adapter(client,{beforeCommit,afterCommit}={}) {
  let count=0;
  return {transaction:async work=>{
    const number=++count;let begun=false,result;
    try {
      await query(client,'begin');begun=true;
      result=await work({query:(sql,params)=>query(client,sql,params)});
      if(beforeCommit) await beforeCommit(number,result);
      await query(client,'commit');begun=false;
    }catch(error) {if(begun)await query(client,'rollback');throw error;}
    if(afterCommit) await afterCommit(number,result);
    return result;
  }};
}
const policy=(f,consumer=f.consumer,leaseSeconds=30)=>({consumer,eventTypes:[f.eventType],maxAttempts:3,leaseSeconds,retrySeconds:3});
const effect=(f,consumer)=>async(event,tx)=>{
  assert.equal(event.clinic_id,f.clinic);assert.equal(event.event_id,f.event);assert.equal(event.event_version,1);
  await tx.query(`insert into private.${f.table}(consumer_id,event_id,effects) values($1,$2,1) on conflict(consumer_id,event_id) do update set effects=${f.table}.effects+1`,[consumer,event.event_id]);
};
async function delivery(f,consumer=f.consumer) {
  return (await query(f.observer,'select * from private.outbox_deliveries where consumer_id=$1 and event_id=$2',[consumer,f.event])).rows[0];
}
async function assertEffects(f,expected) {
  const rows=(await query(f.observer,`select consumer_id,effects from private.${f.table} order by consumer_id`)).rows;
  assert.deepEqual(rows,Object.entries(expected).sort(([a],[b])=>a.localeCompare(b)).map(([consumer_id,effects])=>({consumer_id,effects})));
  const consumers=(await query(f.observer,'select consumer_id from private.consumed_events where event_id=$1 order by consumer_id',[f.event])).rows.map(row=>row.consumer_id);
  assert.deepEqual(consumers,Object.keys(expected).sort());
}
async function assertAttempts(f,consumer,outcomes) {
  const rows=(await query(f.observer,'select attempt,outcome,finished_at is not null finished from private.outbox_attempts where consumer_id=$1 and event_id=$2 order by attempt',[consumer,f.event])).rows;
  assert.deepEqual(rows,outcomes.map((outcome,i)=>({attempt:i+1,outcome,finished:outcome!=='processing'})));
}
async function assertDelivered(f,expected) {
  const actual=(await query(f.observer,'select consumer_id,status,attempts,lease_token,lease_until,last_failure_code,completed_at is not null completed from private.outbox_deliveries where event_id=$1 order by consumer_id',[f.event])).rows;
  assert.deepEqual(actual,Object.entries(expected).sort(([a],[b])=>a.localeCompare(b)).map(([consumer_id,attempts])=>({consumer_id,status:'delivered',attempts,lease_token:null,lease_until:null,last_failure_code:null,completed:true})));
}
async function blocked(f,waiter,blocker) {
  await poll('observed PostgreSQL contention',async()=>(await query(f.observer,'select $2::integer=any(pg_blocking_pids($1)) blocked',[waiter,blocker])).rows[0].blocked);
}
async function lockHandler(f) {
  await query(f.observer,'begin');await query(f.observer,"select pg_advisory_xact_lock(hashtextextended('outbox-evidence:'||$1::text,0))",[f.event]);
}
const waitInHandler=(f,tx)=>tx.query("select pg_advisory_xact_lock(hashtextextended('outbox-evidence:'||$1::text,0))",[f.event]);
async function expiry(f) {
  await poll('authoritative lease expiry',async()=>(await query(f.observer,'select lease_until<=clock_timestamp() expired from private.outbox_deliveries where consumer_id=$1 and event_id=$2',[f.consumer,f.event])).rows[0]?.expired);
}
async function ready(f) {
  await poll('database retry deadline',async()=>(await query(f.observer,'select next_attempt_at<=clock_timestamp() ready from private.outbox_deliveries where consumer_id=$1 and event_id=$2',[f.consumer,f.event])).rows[0]?.ready);
}

async function fixture(url,work) {
  const suffix=randomUUID().replaceAll('-','');
  const f={clinic:randomUUID(),event:randomUUID(),consumer:`evidence_${suffix}`,eventType:`Evidence${suffix}`,table:`outbox_evidence_${suffix}`,clients:[],pending:[],gates:[],dead:new Set()};
  let failure;
  try {
    for(const name of ['observer','a','b']) {
      // Worker transaction timeouts stay below even the deliberately short 6-second crash lease.
      const client=new pg.Client({connectionString:url,application_name:`outbox-evidence-${name}-${suffix}`,connectionTimeoutMillis:2000,statement_timeout:4000,lock_timeout:3000,idle_in_transaction_session_timeout:4500});
      client.on('error',()=>{if(!f.dead.has(client)) f.unexpectedDisconnect=true;});f.clients.push(client);f[name]=client;
      try {await client.connect();}catch {throw new Error('Local PostgreSQL connection unavailable.');}
      f[`${name}Pid`]=(await query(client,'select pg_backend_pid() pid')).rows[0].pid;
    }
    assert.equal(new Set([f.observerPid,f.aPid,f.bPid]).size,3,'distinct PostgreSQL backend sessions required');
    await query(f.observer,'begin');
    await query(f.observer,'insert into public.clinics(id,name) values($1,$2)',[f.clinic,'Synthetic outbox evidence']);
    await query(f.observer,'insert into private.outbox_events(event_id,clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref) values($1,$2,$3,1,$1,$4,$5)',[f.event,f.clinic,f.eventType,randomUUID(),randomUUID()]);
    // Unique, disposable local SQL effect table. No domain mutation, contact data or transport.
    await query(f.observer,`create table private.${f.table}(consumer_id text not null,event_id uuid not null,effects integer not null,primary key(consumer_id,event_id))`);
    await query(f.observer,`alter table private.${f.table} enable row level security`);
    await query(f.observer,`revoke all on private.${f.table} from public,anon,authenticated`);
    await query(f.observer,'commit');
    await work(f);
    assert.ok(!f.unexpectedDisconnect,'no unexpected session failure');
    assert.deepEqual((await query(f.observer,'select published_at,attempts,lease_until from private.outbox_events where event_id=$1',[f.event])).rows,[{published_at:null,attempts:0,lease_until:null}],'consumer state never claims global publication');
  }catch(error) {failure=error;}
  finally {
    const failures=[];const clean=async action=>{try{await action();}catch{failures.push(true);}};
    if(f.observer)await clean(()=>query(f.observer,'rollback'));
    f.gates.forEach(release=>release());
    if(f.observer)for(const name of ['a','b'])if(f[`${name}Pid`]&&!f.dead.has(f[name]))await clean(()=>query(f.observer,'select pg_cancel_backend($1)',[f[`${name}Pid`]]));
    await Promise.allSettled(f.pending);
    for(const client of [f.a,f.b].filter(Boolean))if(!f.dead.has(client))await clean(()=>query(client,'rollback'));
    if(f.observer)await clean(async()=>{
      await query(f.observer,'begin');
      for(const table of ['outbox_attempts','outbox_deliveries','consumed_events'])await query(f.observer,`delete from private.${table} where event_id=$1`,[f.event]);
      await query(f.observer,'delete from private.outbox_events where event_id=$1',[f.event]);
      await query(f.observer,`drop table if exists private.${f.table}`);
      await query(f.observer,'delete from public.clinics where id=$1',[f.clinic]);await query(f.observer,'commit');
    });
    for(const client of f.clients)await clean(()=>client.end());
    if(failures.length)failure=new Error(`${failure?'Scenario failed; ':''}synthetic fixture cleanup failed (${failures.length} operations).`);
  }
  if(failure)throw failure;
}

test('local-only outbox endpoint guard',()=>{
  const url='postgresql://postgres:synthetic-password@127.0.0.1:54322/postgres';assert.equal(validateDatabaseUrl(url),url);
  for(const value of [undefined,'invalid',url.replace('127.0.0.1','db.example.org'),url.replace('54322','5432'),url.replace('/postgres','/other'),`${url}?host=db.example.org`,`${url}#fragment`])assert.throws(()=>validateDatabaseUrl(value),error=>!error.message.includes('synthetic-password')&&!error.message.includes('db.example.org'));
});

test('real local PostgreSQL outbox contention and crash boundaries',{timeout:120000},async t=>{
  const url=localDatabaseUrl();
  await t.test('same consumer concurrent materialization commits exactly one effect',()=>fixture(url,async f=>{
    const hold=gate(f),entered=gate(f);
    const first=launch(f,()=>new OutboxWorker(adapter(f.a,{beforeCommit:async n=>{if(n===1){entered.release();await hold.promise;}}}),policy(f),effect(f,f.consumer)).runOnce());
    await entered.promise;
    const second=launch(f,()=>new OutboxWorker(adapter(f.b),policy(f),effect(f,f.consumer)).runOnce());
    await blocked(f,f.bPid,f.aPid);hold.release();
    const results=await Promise.all([first,second]);assert.ok(results.every(result=>result.ok));assert.deepEqual(results.map(result=>result.value).sort(),['delivered','idle']);
    await assertEffects(f,{[f.consumer]:1});await assertAttempts(f,f.consumer,['delivered']);
    await assertDelivered(f,{[f.consumer]:1});
  }));
  await t.test('different consumer completes independently while first handler is blocked',()=>fixture(url,async f=>{
    const other=`${f.consumer}_other`;await lockHandler(f);
    const first=launch(f,()=>new OutboxWorker(adapter(f.a),policy(f),async(event,tx)=>{await effect(f,f.consumer)(event,tx);await waitInHandler(f,tx);}).runOnce());
    await blocked(f,f.aPid,f.observerPid);
    const second=await new OutboxWorker(adapter(f.b),policy(f,other),effect(f,other)).runOnce();assert.equal(second,'delivered');
    await assertEffects(f,{[other]:1});await query(f.observer,'commit');assert.deepEqual(await first,{ok:true,value:'delivered'});
    await assertEffects(f,{[f.consumer]:1,[other]:1});await assertAttempts(f,f.consumer,['delivered']);await assertAttempts(f,other,['delivered']);
    await assertDelivered(f,{[f.consumer]:1,[other]:1});
  }));
  await t.test('terminated backend after committed lease recovers only after actual expiry',()=>fixture(url,async f=>{
    const hold=gate(f),leased=gate(f);let handlerCalls=0;
    const first=launch(f,()=>new OutboxWorker(adapter(f.a,{afterCommit:async n=>{if(n===1){leased.release();await hold.promise;throw Object.assign(new Error('Synthetic crash boundary'),{code:'CRASH'});}}}),policy(f,f.consumer,6),async()=>{handlerCalls++;}).runOnce());
    await leased.promise;const before=await delivery(f);assert.equal(before.status,'processing');assert.equal(before.attempts,1);await assertEffects(f,{});
    f.dead.add(f.a);assert.equal((await query(f.observer,'select pg_terminate_backend($1) terminated',[f.aPid])).rows[0].terminated,true);hold.release();assert.deepEqual(await first,{ok:false,code:'CRASH'});assert.equal(handlerCalls,0);
    await poll('terminated backend disappearance',async()=>(await query(f.observer,'select not exists(select 1 from pg_stat_activity where pid=$1) gone',[f.aPid])).rows[0].gone);
    const recovery=new OutboxWorker(adapter(f.b),policy(f,f.consumer,6),effect(f,f.consumer));assert.equal(await recovery.runOnce(),'idle');await assertAttempts(f,f.consumer,['processing']);
    await expiry(f);assert.equal(await recovery.runOnce(),'delivered');await assertEffects(f,{[f.consumer]:1});await assertAttempts(f,f.consumer,['lease_expired','delivered']);await assertDelivered(f,{[f.consumer]:2});
  }));
  await t.test('reclaimed token fences paused original claimant before its handler',()=>fixture(url,async f=>{
    const hold=gate(f),leased=gate(f);let oldCalls=0;
    const first=launch(f,()=>new OutboxWorker(adapter(f.a,{afterCommit:async n=>{if(n===1){leased.release();await hold.promise;}}}),policy(f,f.consumer,6),async()=>{oldCalls++;}).runOnce());
    await leased.promise;const oldToken=(await delivery(f)).lease_token;assert.ok(oldToken);await expiry(f);
    const replacement=gate(f),reclaimed=gate(f);
    const second=launch(f,()=>new OutboxWorker(adapter(f.b,{afterCommit:async n=>{if(n===1){reclaimed.release();await replacement.promise;}}}),policy(f),effect(f,f.consumer)).runOnce());
    await reclaimed.promise;assert.notEqual((await delivery(f)).lease_token,oldToken);
    hold.release();assert.deepEqual(await first,{ok:true,value:'stale'});assert.equal(oldCalls,0);await assertEffects(f,{});
    replacement.release();assert.deepEqual(await second,{ok:true,value:'delivered'});await assertEffects(f,{[f.consumer]:1});await assertAttempts(f,f.consumer,['lease_expired','delivered']);
    await assertDelivered(f,{[f.consumer]:2});
  }));
  await t.test('handler transaction rolls back effect/consumption then another session recovers attempt',()=>fixture(url,async f=>{
    await lockHandler(f);
    const first=launch(f,()=>new OutboxWorker(adapter(f.a),policy(f),async(event,tx)=>{await effect(f,f.consumer)(event,tx);await waitInHandler(f,tx);throw new Error('Synthetic handler failure: never persisted');}).runOnce());
    await blocked(f,f.aPid,f.observerPid);await assertEffects(f,{});await query(f.observer,'commit');assert.deepEqual(await first,{ok:true,value:'retry'});
    await assertEffects(f,{});await assertAttempts(f,f.consumer,['handler_failed']);const failed=await delivery(f);assert.equal(failed.status,'pending');assert.equal(failed.last_failure_code,'handler_failed');assert.equal(failed.lease_token,null);
    const recovery=new OutboxWorker(adapter(f.b),policy(f),effect(f,f.consumer));assert.equal(await recovery.runOnce(),'idle');await ready(f);assert.equal(await recovery.runOnce(),'delivered');
    await assertEffects(f,{[f.consumer]:1});await assertAttempts(f,f.consumer,['handler_failed','delivered']);await assertDelivered(f,{[f.consumer]:2});
  }));
});
