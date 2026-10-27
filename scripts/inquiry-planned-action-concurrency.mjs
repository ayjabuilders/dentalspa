// Synthetic, local PostgreSQL evidence. Never accepts an environment-supplied DB URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
function validateDatabaseUrl(value) {
 let url;try{url=new URL(value);}catch{throw new Error('Local Supabase status did not provide DB_URL.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.port!=='54322'||url.pathname!=='/postgres'||url.username!=='postgres'||url.search||url.hash)throw new Error('Refusing connection outside the repository local PostgreSQL endpoint.');
 return url.toString();
}
function localDatabaseUrl(){
 let status;try{const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:1024*1024};const output=process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],options):execFileSync('pnpm',['exec','supabase','status','-o','json'],options);status=JSON.parse(output);}catch{throw new Error('Local Supabase unavailable; start/reset local services before contention evidence.');}
 return validateDatabaseUrl(status?.DB_URL); // Never print status or credentials.
}
async function query(client,sql,params=[]){try{return await client.query(sql,params);}catch(error){const code=typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:'UNKNOWN';throw Object.assign(new Error(`Database operation failed (${code})`),{code});}}
async function blocked(f){
 const deadline=performance.now()+8000;
 while(performance.now()<deadline){if((await query(f.observer,'select $2::integer=any(pg_blocking_pids($1)) blocked',[f.bPid,f.aPid])).rows[0].blocked)return;await delay(20);}
 throw new Error('Expected independent-session row-lock contention was not observed.');
}
async function fixture(url,work){
 const f={clinic:randomUUID(),user:randomUUID(),inquiry:randomUUID(),clients:[],pending:[]};let failure;
 try{
  for(const name of ['observer','a','b']){
   const client=new pg.Client({connectionString:url,application_name:`planned-action-evidence-${name}-${f.clinic}`,connectionTimeoutMillis:5000,statement_timeout:15000,lock_timeout:12000,idle_in_transaction_session_timeout:20000});client.on('error',()=>{f.connectionFailed=true;});f.clients.push(client);f[name]=client;
   try{await client.connect();}catch{throw new Error('Local PostgreSQL connection failed.');}
   f[`${name}Pid`]=(await query(client,'select pg_backend_pid() pid')).rows[0].pid;
  }
  assert.equal(new Set([f.observerPid,f.aPid,f.bPid]).size,3);
  f.priorEnabled=(await query(f.observer,'select enabled from private.intake_command_settings where singleton')).rows[0].enabled;
  await query(f.observer,'begin');
  await query(f.observer,'insert into public.clinics(id,name) values($1,$2)',[f.clinic,'Synthetic planned_action contention']);
  await query(f.observer,'insert into auth.users(id) values($1)',[f.user]);
  await query(f.observer,"insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)",[f.clinic,f.user]);
  await query(f.observer,"insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source) values($1,$2,$3,'Synthetic planned_action subject','phone')",[f.inquiry,f.clinic,f.user]);
  await query(f.observer,'update private.intake_command_settings set enabled=true where singleton');await query(f.observer,'commit');
  await work(f);assert.ok(!f.connectionFailed,'connections remained healthy');
 }catch(error){failure=error;}
 finally{
  const errors=[];const clean=async op=>{try{await op();}catch{errors.push('cleanup failure');}};
  if(f.observer){await clean(()=>query(f.observer,'rollback'));for(const pid of [f.aPid,f.bPid].filter(Boolean))await clean(()=>query(f.observer,'select pg_cancel_backend($1)',[pid]));}
  await Promise.allSettled(f.pending);for(const client of [f.a,f.b].filter(Boolean))await clean(()=>query(client,'rollback'));
  if(f.observer)await clean(async()=>{
   await query(f.observer,'begin');
   // Session-local bypass only for deleting our immutable synthetic receipts;
   // no shared trigger is disabled. All fixture tables are deleted in FK order.
   await query(f.observer,"set local session_replication_role='replica'");
   await query(f.observer,'delete from private.outbox_attempts where event_id in(select event_id from private.outbox_events where clinic_id=$1)',[f.clinic]);
   await query(f.observer,'delete from private.outbox_deliveries where event_id in(select event_id from private.outbox_events where clinic_id=$1)',[f.clinic]);
   await query(f.observer,'delete from private.consumed_events where event_id in(select event_id from private.outbox_events where clinic_id=$1)',[f.clinic]);
   for(const table of ['inquiry_planned_action_receipts','inquiry_planned_actions','audit_events','outbox_events'])await query(f.observer,`delete from private.${table} where clinic_id=$1`,[f.clinic]);
   await query(f.observer,'delete from public.inquiries where clinic_id=$1',[f.clinic]);await query(f.observer,'delete from public.clinic_memberships where clinic_id=$1',[f.clinic]);await query(f.observer,'delete from public.clinics where id=$1',[f.clinic]);await query(f.observer,'delete from auth.users where id=$1',[f.user]);
   if(f.priorEnabled!==undefined)await query(f.observer,'update private.intake_command_settings set enabled=$1 where singleton',[f.priorEnabled]);
   await query(f.observer,'commit');
  });
  for(const client of f.clients)await clean(()=>client.end());
  if(errors.length)failure=new Error(`Fixture cleanup failed (${errors.length} operations); local stack teardown required.`);
 }
 if(failure)throw failure;
}

async function begin(f,client){await query(client,'begin');await query(client,'set local role authenticated');await query(client,"select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.method','POST',true)",[f.user,JSON.stringify({sub:f.user,role:'authenticated'})]);assert.deepEqual((await query(client,'select current_user role,auth.uid() subject')).rows[0],{role:'authenticated',subject:f.user});}
async function command(f,client,key,planned_action){return(await query(client,'select public.set_inquiry_planned_action($1,$2,$3,$4::jsonb,$5) result',[f.clinic,f.inquiry,key,JSON.stringify({expected_revision:0,planned_action}),randomUUID()])).rows[0].result;}
function launch(f,operation){const pending=operation().then(value=>({ok:true,value}),error=>({ok:false,code:error.code??'UNKNOWN'}));f.pending.push(pending);return pending;}
async function assertCommitted(f,result){
 assert.equal(result.replayed,false);assert.equal(result.receipt.changed,true);assert.equal(result.receipt.previous_revision,0);assert.equal(result.receipt.revision,1);
 for(const table of ['inquiry_planned_actions','inquiry_planned_action_receipts','audit_events','outbox_events'])assert.equal((await query(f.observer,`select count(*)::int n from private.${table} where clinic_id=$1`,[f.clinic])).rows[0].n,1,`${table} exactly once`);
 assert.deepEqual((await query(f.observer,'select receipt from private.inquiry_planned_action_receipts where clinic_id=$1',[f.clinic])).rows[0].receipt,result.receipt);
 assert.deepEqual((await query(f.observer,'select planned_action,revision from private.inquiry_planned_actions where clinic_id=$1 and inquiry_id=$2',[f.clinic,f.inquiry])).rows[0],{planned_action:result.receipt.planned_action,revision:1});
 assert.deepEqual((await query(f.observer,'select action,aggregate_id,actor_ref from private.audit_events where clinic_id=$1',[f.clinic])).rows[0],{action:'InquiryPlannedActionChanged',aggregate_id:f.inquiry,actor_ref:f.user});
 assert.deepEqual((await query(f.observer,'select event_type,event_version,aggregate_type,aggregate_id,actor_ref,payload from private.outbox_events where clinic_id=$1',[f.clinic])).rows[0],{event_type:'InquiryPlannedActionChanged',event_version:1,aggregate_type:'inquiry',aggregate_id:f.inquiry,actor_ref:f.user,payload:{vocabulary_version:1,previous_planned_action:null,planned_action:result.receipt.planned_action,previous_revision:0,revision:1,recorded_at:result.receipt.recorded_at}});
}
test('local-only endpoint guard rejects remote and unexpected endpoints without disclosure',()=>{
 const local='postgresql://postgres:synthetic-password@127.0.0.1:54322/postgres';assert.equal(validateDatabaseUrl(local),local);
 for(const value of [undefined,'bad',local.replace('127.0.0.1','db.example.org'),local.replace('54322','5432'),local.replace('/postgres','/production'),local+'?sslmode=require',local+'#fragment',local.replace('postgres:synthetic','other:synthetic')])assert.throws(()=>validateDatabaseUrl(value),error=>!error.message.includes('synthetic-password')&&!error.message.includes('db.example.org'));
});
test('local PostgreSQL planned action independent-session evidence',{timeout:90000},async t=>{
 const url=localDatabaseUrl();
 await t.test('competing revision-zero commands produce one change and one stale conflict',()=>fixture(url,async f=>{
  await begin(f,f.a);await begin(f,f.b);
  const first=await command(f,f.a,randomUUID(),'review_inquiry');const second=launch(f,()=>command(f,f.b,randomUUID(),'review_follow_up'));
  await blocked(f);await query(f.a,'commit');assert.deepEqual(await second,{ok:false,code:'PT409'});await query(f.b,'rollback');await assertCommitted(f,first);
 }));
 await t.test('concurrent identical key produces immutable replay and exactly one effect',()=>fixture(url,async f=>{
  await begin(f,f.a);await begin(f,f.b);const key=randomUUID();
  const first=await command(f,f.a,key,'review_inquiry');const second=launch(f,()=>command(f,f.b,key,'review_inquiry'));
  await blocked(f);await query(f.a,'commit');assert.deepEqual(await second,{ok:true,value:{receipt:first.receipt,replayed:true}});await query(f.b,'commit');await assertCommitted(f,first);
 }));
});
