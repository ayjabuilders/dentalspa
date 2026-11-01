import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Fixed loopback only; all migration, fixture and command writes roll back.
const db = new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const clinic='10000000-0000-4000-8000-000000000001';
const actor=randomUUID(), foreignActor=randomUUID(), assistant=randomUUID();
const provider=randomUUID(), chair=randomUUID(), appointment=randomUUID(), other=randomUUID();
const gate=randomUUID();
let checks=0;
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
async function fail(code,fn){
  await db.query('savepoint expected_failure');
  let caught;
  try {await fn();} catch(error){caught=error;}
  await db.query('rollback to savepoint expected_failure');
  assert.equal(caught?.code,code);
}
async function identity(id){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);}
async function command({id=appointment,action='reschedule',date=day,time='16:00',version=1,key=randomUUID(),gateKey=gate}={}){
  const result=await db.query('select public.manage_local_demo_appointment($1,$2,$3,$4,$5,$6,$7,$8) receipt',
    [clinic,id,action,action==='cancel'?null:date,action==='cancel'?null:time,version,key,gateKey]);
  return result.rows[0].receipt;
}
let day;
await db.connect();
try {
  await db.query('begin');
  await db.query("set local lock_timeout='5s'; set local statement_timeout='20s'");
  const installed=await db.query("select to_regclass('private.demo_appointment_command_receipts') is not null as present");
  if(!installed.rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261031091537_local_appointment_lifecycle.sql',import.meta.url),'utf8'));
  const date=await db.query("select to_char(current_date+28+((8-extract(isodow from current_date)::int)%7),'YYYY-MM-DD') as fixture_date");
  day=date.rows[0].fixture_date;
  await db.query('insert into auth.users(id) values($1),($2),($3)',[actor,foreignActor,assistant]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true),($1,$3,'assistant',true)",[clinic,actor,assistant]);
  await db.query("insert into private.demo_booking_sample_resources(id,clinic_id,kind,display_name) values($1,$3,'provider','Lifecycle test fictif'),($2,$3,'chair','Lifecycle test fictif')",[provider,chair,clinic]);
  for(const [id,time] of [[appointment,'14:00'],[other,'15:00']]){
    const request=randomUUID();
    await db.query("insert into private.demo_booking_requests(id,request_key,scenario_id,requested_date,requested_time) values($1,$2,'salma',$3,$4)",[request,randomUUID(),day,time]);
    await db.query("insert into private.demo_confirmed_appointments(id,clinic_id,booking_request_id,scenario_id,provider_resource_id,chair_resource_id,starts_at,ends_at,confirmed_by) values($1,$2,$3,'salma',$4,$5,($6::date+$7::time) at time zone 'Africa/Casablanca',(($6::date+$7::time) at time zone 'Africa/Casablanca')+interval '45 minutes',$8)",[id,clinic,request,provider,chair,day,time,actor]);
  }
  await db.query('update private.demo_booking_confirmation_settings set enabled=true,api_gate_key=$1 where singleton',[gate]);
  await identity(actor);
  await db.query('set local role authenticated');
  await check('resource conflict rejected',()=>fail('SH409',()=>command({time:'15:00'})));
  await check('out-of-hours move rejected',()=>fail('22023',()=>command({time:'12:30'})));
  await check('stale version rejected',()=>fail('SH409',()=>command({version:8})));
  await check('unknown/foreign object denied',()=>fail('SH404',()=>command({id:randomUUID()})));
  await check('gate mismatch rejected',()=>fail('PT503',()=>command({gateKey:'invalid'})));
  await identity(foreignActor);
  await check('nonmember denied',()=>fail('42501',()=>command()));
  await identity(assistant);
  await check('assistant denied',()=>fail('42501',()=>command()));
  await identity('');
  await check('missing identity denied',()=>fail('28000',()=>command()));
  await identity(actor);
  const key=randomUUID();
  let receipt;
  await check('reschedule persists version and Casablanca time',async()=>{
    receipt=await command({key});assert.equal(receipt.version,2);assert.equal(receipt.status,'confirmed');
    const time=await db.query("select to_char($1::timestamptz at time zone 'Africa/Casablanca','HH24:MI') value",[receipt.starts_at]);
    assert.equal(time.rows[0].value,'16:00');
  });
  await check('same request retries without another transition',async()=>assert.deepEqual(await command({key}),{...receipt,replayed:true}));
  await check('key reuse with different payload denied',()=>fail('SH410',()=>command({key,time:'17:00'})));
  await db.query('reset role');
  await check('audit and outbox once per command',async()=>{
    const r=await db.query('select (select count(*)::int from private.audit_events where correlation_id=$1) audit,(select count(*)::int from private.outbox_events where correlation_id=$1) outbox',[key]);
    assert.deepEqual(r.rows[0],{audit:1,outbox:1});
  });
  await db.query("create function private.lifecycle_test_fail_outbox() returns trigger language plpgsql as $$begin if new.event_type='DemoAppointmentCancelled' then raise exception 'synthetic failure'; end if; return new; end$$; create trigger lifecycle_test_fail_outbox before insert on private.outbox_events for each row execute function private.lifecycle_test_fail_outbox()");
  await db.query('set local role authenticated');
  const cancelKey=randomUUID();
  await check('outbox failure aborts cancellation',()=>fail('P0001',()=>command({action:'cancel',version:2,key:cancelKey})));
  await db.query('reset role');
  await check('failed cancellation leaves appointment and receipt untouched',async()=>{
    const r=await db.query('select status,version,(select count(*)::int from private.demo_appointment_command_receipts where request_key=$2) receipts from private.demo_confirmed_appointments where id=$1',[appointment,cancelKey]);
    assert.deepEqual(r.rows[0],{status:'confirmed',version:2,receipts:0});
  });
  await db.query('drop trigger lifecycle_test_fail_outbox on private.outbox_events; drop function private.lifecycle_test_fail_outbox()');
  await db.query('set local role authenticated');
  await check('cancellation persists and increments version',async()=>{
    const r=await command({action:'cancel',version:2,key:cancelKey});assert.equal(r.status,'cancelled');assert.equal(r.version,3);
  });
  await check('cancelled slot becomes available to another appointment',async()=>{
    const r=await command({id:other});assert.equal(r.version,2);assert.equal(r.status,'confirmed');
  });
  await check('cancelled appointment cannot be silently reactivated',()=>fail('SH409',()=>command({version:3,time:'17:00'})));
  await db.query('reset role');
  await db.query('update public.clinic_memberships set active=false where user_id=$1',[actor]);
  await db.query('set local role authenticated');
  await check('revocation denies even idempotent replay',()=>fail('42501',()=>command({key})));
  console.log(`${checks} native PostgreSQL checks passed. All synthetic test changes rolled back.`);
} finally {await db.query('rollback');await db.end();}
