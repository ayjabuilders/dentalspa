// Local PostgreSQL acceptance evidence. Never point this fixture writer at a hosted DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';

function localDatabaseUrl() {
  let status;
  try {
    // Capture, never echo: status also contains API credentials we do not need.
    const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:1024*1024};
    const output=process.platform==='win32'
      ?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],options)
      :execFileSync('pnpm',['exec','supabase','status','-o','json'],options);
    status=JSON.parse(output);
  } catch { throw new Error('Local Supabase status unavailable; start/reset the local stack before running concurrency evidence.'); }
  return validateDatabaseUrl(status?.DB_URL);
}
function validateDatabaseUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error('Local Supabase status did not return a valid DB_URL.'); }
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    ||url.port!=='54322'||url.pathname!=='/postgres'||url.username!=='postgres'||url.search||url.hash) {
    throw new Error('Refusing database connection: expected the repository local PostgreSQL endpoint only.');
  }
  return url.toString();
}

// Do not include provider error text, SQL, connection options or captured status in failures.
async function query(client,sql,values=[]) {
  try { return await client.query(sql,values); }
  catch(error) {
    const code=typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:'UNKNOWN';
    throw Object.assign(new Error(`Database operation failed (${code})`),{code});
  }
}
async function poll(label,predicate,timeout=8000) {
  const deadline=performance.now()+timeout;
  while(performance.now()<deadline) { if(await predicate()) return;await delay(20); }
  throw new Error(`Timed out waiting for ${label}`);
}
const systemActor='00000000-0000-4000-8000-000000000001';
const countTables=['scheduling_holds','scheduling_occupancy','scheduling_idempotency','audit_events','outbox_events'];

async function fixture(url,work) {
  const f={clinic:randomUUID(),user:randomUUID(),provider:randomUUID(),provider2:randomUUID(),chair:randomUUID(),chair2:randomUUID(),clients:[],pending:[],triggers:[]};
  let failure;
  try {
    for(const name of ['observer','a','b']) {
      const client=new pg.Client({connectionString:url,application_name:`scheduling-evidence-${name}-${f.clinic}`,connectionTimeoutMillis:5000,statement_timeout:15000,lock_timeout:12000,idle_in_transaction_session_timeout:20000});
      // An idle connection failure must not become an uncaught EventEmitter error.
      client.on('error',()=>{f.connectionFailed=true;});f.clients.push(client);f[name]=client;
      try {await client.connect();} catch {throw new Error('Local PostgreSQL connection failed.');}
      f[`${name}Pid`]=(await query(client,'select pg_backend_pid() pid')).rows[0].pid;
    }
    assert.equal(new Set([f.observerPid,f.aPid,f.bPid]).size,3,'three genuinely independent backend connections required');
    assert.equal((await query(f.observer,"select exists(select 1 from pg_extension where extname='btree_gist') present")).rows[0].present,true);
    await query(f.observer,'begin');
    await query(f.observer,'insert into public.clinics(id,name) values($1,$2)',[f.clinic,'Synthetic concurrency evidence']);
    await query(f.observer,'insert into auth.users(id) values($1)',[f.user]);
    await query(f.observer,"insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)",[f.clinic,f.user]);
    await query(f.observer,'insert into private.scheduling_settings(clinic_id,enabled) values($1,true)',[f.clinic]);
    for(const [id,kind] of [[f.provider,'provider'],[f.provider2,'provider'],[f.chair,'chair'],[f.chair2,'chair']]) {
      await query(f.observer,'insert into private.scheduling_resources(id,clinic_id,kind,display_name) values($1,$2,$3,$4)',[id,f.clinic,kind,`Synthetic ${kind}`]);
      await query(f.observer,"insert into private.scheduling_windows(clinic_id,resource_id,starts_at,ends_at) values($1,$2,date_trunc('milliseconds',clock_timestamp()-interval '1 day'),date_trunc('milliseconds',clock_timestamp()+interval '2 days'))",[f.clinic,id]);
    }
    await query(f.observer,'commit');
    const start=(await query(f.observer,"select date_trunc('milliseconds',clock_timestamp()+interval '1 hour') start")).rows[0].start;
    f.body={provider_resource_id:f.provider,chair_resource_id:f.chair,starts_at:start.toISOString(),ends_at:new Date(+start+1800000).toISOString(),display_timezone:'Africa/Casablanca'};
    await work(f);assert.ok(!f.connectionFailed,'connections remained healthy');
  } catch(error) {failure=error;}
  finally {
    const cleanupErrors=[];
    const clean=async operation=>{try {await operation();}catch{cleanupErrors.push('cleanup operation failed');}};
    if(f.observer) {
      // Release any observer barrier before cancelling waiting contenders.
      await clean(()=>query(f.observer,'rollback'));
      for(const pid of [f.aPid,f.bPid].filter(Boolean)) await clean(()=>query(f.observer,'select pg_cancel_backend($1)',[pid]));
    }
    await Promise.allSettled(f.pending);
    for(const client of [f.a,f.b].filter(Boolean)) await clean(()=>query(client,'rollback'));
    if(f.observer) {
      for(const {table,name} of f.triggers) {
        await clean(()=>query(f.observer,`drop trigger if exists ${name} on private.${table}`));
        await clean(()=>query(f.observer,`drop function if exists private.${name}()`));
      }
      await clean(async()=>{
        await query(f.observer,'begin');
        await query(f.observer,'delete from private.outbox_attempts where event_id in(select event_id from private.outbox_events where clinic_id=$1)',[f.clinic]);
        await query(f.observer,'delete from private.outbox_deliveries where event_id in(select event_id from private.outbox_events where clinic_id=$1)',[f.clinic]);
        await query(f.observer,'delete from private.consumed_events where event_id in(select event_id from private.outbox_events where clinic_id=$1)',[f.clinic]);
        for(const table of ['scheduling_idempotency','scheduling_occupancy','scheduling_holds','outbox_events','audit_events','scheduling_windows','scheduling_resources','scheduling_settings']) await query(f.observer,`delete from private.${table} where clinic_id=$1`,[f.clinic]);
        await query(f.observer,'delete from public.clinic_memberships where clinic_id=$1',[f.clinic]);
        await query(f.observer,'delete from public.clinics where id=$1',[f.clinic]);
        await query(f.observer,'delete from auth.users where id=$1',[f.user]);
        await query(f.observer,'commit');
      });
    }
    for(const client of f.clients) await clean(()=>client.end());
    if(cleanupErrors.length) failure=new Error(`${failure?'Scenario failed; ':''}fixture cleanup failed (${cleanupErrors.length} operations); local stack teardown is required.`);
  }
  if(failure) throw failure;
}

async function begin(f,client) {
  await query(client,'begin');await query(client,'set local role authenticated');
  await query(client,"select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.method','POST',true)",[f.user,JSON.stringify({sub:f.user,role:'authenticated'})]);
  assert.deepEqual((await query(client,'select current_user role,auth.uid() subject')).rows[0],{role:'authenticated',subject:f.user});
}
async function create(f,client,body=f.body,key=randomUUID()) {
  return (await query(client,'select public.scheduling_create_hold($1,$2,$3::jsonb,$4) result',[f.clinic,key,JSON.stringify(body),randomUUID()])).rows[0].result;
}
async function release(f,client,id,key=randomUUID()) {
  return (await query(client,'select public.scheduling_release_hold($1,$2,$3,$4) result',[f.clinic,id,key,randomUUID()])).rows[0].result;
}
function launch(f,operation) {
  const promise=operation().then(value=>({ok:true,value}),error=>({ok:false,code:error.code}));
  f.pending.push(promise);return promise;
}
async function blocked(f,waiter,blocker) {
  await poll('verified PostgreSQL lock contention',async()=>{
    const row=(await query(f.observer,"select $2::integer=any(pg_blocking_pids($1)) and exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) blocked",[waiter,blocker])).rows[0];
    return row.blocked;
  });
}
async function counts(f,expected) {
  const actual=[];
  for(const table of countTables) actual.push((await query(f.observer,`select count(*)::int n from private.${table} where clinic_id=$1`,[f.clinic])).rows[0].n);
  assert.deepEqual(actual,expected,`exact row counts: ${countTables.join(', ')}`);
  const invalid=(await query(f.observer,`select count(*)::int n from private.scheduling_occupancy a join private.scheduling_occupancy b on a.clinic_id=b.clinic_id and a.resource_id=b.resource_id and a.hold_id<b.hold_id and a.period&&b.period where a.clinic_id=$1 and a.active and b.active`,[f.clinic])).rows[0].n;
  assert.equal(invalid,0,'no active overlapping resource occupancy');
}
async function events(f,expected) {
  const actual=(await query(f.observer,'select event_type,count(*)::int n from private.outbox_events where clinic_id=$1 group by event_type order by event_type',[f.clinic])).rows;
  assert.deepEqual(actual,Object.entries(expected).sort(([a],[b])=>a.localeCompare(b)).map(([event_type,n])=>({event_type,n})));
  assert.equal((await query(f.observer,"select count(*)::int n from private.outbox_events where clinic_id=$1 and (aggregate_type is distinct from 'scheduling_hold' or event_version<>1 or payload->>'status' is distinct from case event_type when 'SlotHoldCreated' then 'held' when 'SlotHoldReleased' then 'released' when 'SlotHoldExpired' then 'expired' end or actor_ref is distinct from case when event_type='SlotHoldExpired' then $2::uuid else $3::uuid end)",[f.clinic,systemActor,f.user])).rows[0].n,0,'event envelope and attribution are correct');
}

test('local-only endpoint guard fails closed without revealing connection details',()=>{
  const local='postgresql://postgres:synthetic-password@127.0.0.1:54322/postgres';
  assert.equal(validateDatabaseUrl(local),local);
  for(const value of [undefined,'invalid',local.replace('127.0.0.1','db.example.org'),local.replace('54322','5432'),local.replace('/postgres','/other'),`${local}?host=db.example.org`,`${local}#fragment`,local.replace('postgresql:','https:'),local.replace('postgres:synthetic','other:synthetic')]) {
    assert.throws(()=>validateDatabaseUrl(value),error=>error instanceof Error&&!error.message.includes('synthetic-password')&&!error.message.includes('db.example.org'));
  }
});

test('local PostgreSQL scheduling concurrency acceptance',{timeout:150000},async t=>{
  const url=localDatabaseUrl();
  for(const collision of ['provider','chair']) await t.test(`same ${collision}: one committed winner`,()=>fixture(url,async f=>{
    await begin(f,f.a);await begin(f,f.b);
    const first=await create(f,f.a);
    const competing={...f.body,...(collision==='provider'?{chair_resource_id:f.chair2}:{provider_resource_id:f.provider2})};
    const waiting=launch(f,()=>create(f,f.b,competing));await blocked(f,f.bPid,f.aPid);
    await query(f.a,'commit');assert.deepEqual(await waiting,{ok:false,code:'SH409'});await query(f.b,'rollback');
    await counts(f,[1,2,1,1,1]);await events(f,{SlotHoldCreated:1});
    assert.deepEqual((await query(f.observer,'select id,status,version from private.scheduling_holds where clinic_id=$1',[f.clinic])).rows,[{id:first.item.id,status:'held',version:1}]);
  }));
  await t.test('adjacent intervals both commit after genuine contention',()=>fixture(url,async f=>{
    await begin(f,f.a);await begin(f,f.b);await create(f,f.a);
    const next={...f.body,starts_at:f.body.ends_at,ends_at:new Date(Date.parse(f.body.ends_at)+1800000).toISOString()};
    const waiting=launch(f,()=>create(f,f.b,next));await blocked(f,f.bPid,f.aPid);await query(f.a,'commit');assert.equal((await waiting).ok,true);await query(f.b,'commit');
    await counts(f,[2,4,2,2,2]);await events(f,{SlotHoldCreated:2});
  }));
  await t.test('same-key waiter returns immutable receipt without renewal',()=>fixture(url,async f=>{
    await begin(f,f.a);await begin(f,f.b);const key=randomUUID(),first=await create(f,f.a,f.body,key);
    const waiting=launch(f,()=>create(f,f.b,f.body,key));await blocked(f,f.bPid,f.aPid);await query(f.a,'commit');
    assert.deepEqual(await waiting,{ok:true,value:{...first,replayed:true}});await query(f.b,'commit');await counts(f,[1,2,1,1,1]);await events(f,{SlotHoldCreated:1});
  }));
  await t.test('rollback of first contender permits the waiting transaction to win',()=>fixture(url,async f=>{
    await begin(f,f.a);await begin(f,f.b);const rolledBack=await create(f,f.a);
    const waiting=launch(f,()=>create(f,f.b));await blocked(f,f.bPid,f.aPid);await query(f.a,'rollback');const winner=await waiting;assert.equal(winner.ok,true);await query(f.b,'commit');
    await counts(f,[1,2,1,1,1]);await events(f,{SlotHoldCreated:1});assert.notEqual(winner.value.item.id,rolledBack.item.id);
    assert.equal((await query(f.observer,'select count(*)::int n from private.scheduling_holds where id=$1',[rolledBack.item.id])).rows[0].n,0);
  }));
  await t.test('database observation and expiry derive from clock after lock acquisition',()=>fixture(url,async f=>{
    await query(f.observer,'begin');await query(f.observer,"select pg_advisory_xact_lock(hashtextextended('scheduling:'||$1::text,0))",[f.clinic]);
    await begin(f,f.a);const transactionStart=(await query(f.a,'select transaction_timestamp() time')).rows[0].time;
    const waiting=launch(f,()=>create(f,f.a));await blocked(f,f.aPid,f.observerPid);
    await poll('database clock advance',async()=>(await query(f.observer,"select clock_timestamp()>$1::timestamptz+interval '250 milliseconds' ready",[transactionStart])).rows[0].ready);
    const unlockBoundary=(await query(f.observer,"select date_trunc('milliseconds',clock_timestamp()) time")).rows[0].time;
    await query(f.observer,'commit');const outcome=await waiting;assert.equal(outcome.ok,true);await query(f.a,'commit');
    assert.ok(Date.parse(outcome.value.observed_at)>=+unlockBoundary);assert.ok(Date.parse(outcome.value.observed_at)>+transactionStart);
    assert.equal(Date.parse(outcome.value.item.expires_at)-Date.parse(outcome.value.observed_at),300000);await counts(f,[1,2,1,1,1]);
  }));
  for(const firstCommand of ['release','create']) await t.test(`expiry race with ${firstCommand} queued first`,()=>fixture(url,async f=>{
    await query(f.observer,'update private.scheduling_settings set hold_ttl_seconds=2 where clinic_id=$1',[f.clinic]);
    await begin(f,f.a);const original=await create(f,f.a);await query(f.a,'commit');
    await query(f.observer,'begin');await query(f.observer,"select pg_advisory_xact_lock(hashtextextended('scheduling:'||$1::text,0))",[f.clinic]);
    await begin(f,f.a);await begin(f,f.b);
    let releasing,creating;
    if(firstCommand==='release') {releasing=launch(f,()=>release(f,f.a,original.item.id));await blocked(f,f.aPid,f.observerPid);creating=launch(f,()=>create(f,f.b));await blocked(f,f.bPid,f.observerPid);}
    else {creating=launch(f,()=>create(f,f.b));await blocked(f,f.bPid,f.observerPid);releasing=launch(f,()=>release(f,f.a,original.item.id));await blocked(f,f.aPid,f.observerPid);}
    await poll('authoritative original lease expiry',async()=>(await query(f.observer,'select clock_timestamp()>=$1::timestamptz ready',[original.item.expires_at])).rows[0].ready);
    await query(f.observer,'commit');
    // Commit whichever contender succeeds as soon as it finishes: the other may still need its lock.
    const finishRelease=releasing.then(async outcome=>{await query(f.a,outcome.ok?'commit':'rollback');return outcome;});
    const finishCreate=creating.then(async outcome=>{await query(f.b,outcome.ok?'commit':'rollback');return outcome;});
    const [released,created]=await Promise.all([finishRelease,finishCreate]);assert.deepEqual(released,{ok:false,code:'SH411'});assert.equal(created.ok,true);
    await counts(f,[2,4,2,3,3]);await events(f,{SlotHoldCreated:2,SlotHoldExpired:1});
    assert.deepEqual((await query(f.observer,'select status,version from private.scheduling_holds where id=$1',[original.item.id])).rows[0],{status:'expired',version:2});
    assert.deepEqual((await query(f.observer,'select status,version from private.scheduling_holds where id=$1',[created.value.item.id])).rows[0],{status:'held',version:1});
    assert.equal((await query(f.observer,'select count(*)::int n from private.scheduling_occupancy where clinic_id=$1 and active',[f.clinic])).rows[0].n,2);
  }));
  for(const table of ['audit_events','outbox_events','scheduling_idempotency']) await t.test(`${table} failure rolls back all paired writes`,()=>fixture(url,async f=>{
    const name=`evidence_${randomUUID().replaceAll('-','')}`;f.triggers.push({table,name});
    // All identifiers are fixed table names or locally generated hex. Trigger affects only this unique fixture clinic.
    await query(f.observer,`create function private.${name}() returns trigger language plpgsql set search_path='' as $$begin if new.clinic_id='${f.clinic}'::uuid then raise exception using errcode='P0001',message='synthetic sink failure';end if;return new;end$$`);
    await query(f.observer,`create trigger ${name} before insert on private.${table} for each row execute function private.${name}()`);
    await begin(f,f.a);const outcome=await launch(f,()=>create(f,f.a));assert.deepEqual(outcome,{ok:false,code:'P0001'});await query(f.a,'rollback');await counts(f,[0,0,0,0,0]);
  }));
});
