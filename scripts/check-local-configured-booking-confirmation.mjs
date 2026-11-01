import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
// Fixed local endpoint. Schema and all synthetic fixtures are rolled back.
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const clinic='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002';
const actor=randomUUID(),gate=randomUUID();let checks=0;
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
async function fails(code,fn){await db.query('savepoint failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint failure');assert.equal(error?.code,code,error?.message??'Expected rejection');}
async function role(name){await db.query('reset role');if(name)await db.query(`set local role ${name}`);}
await db.connect();
try{
  await db.query('begin');
  const installed=(await db.query("select to_regclass('private.configured_appointments') is not null as present")).rows[0].present;
  if(!installed)await db.query(readFileSync(new URL('../supabase/migrations/20261031100619_configured_booking_confirmation.sql',import.meta.url),'utf8'));
  if(!(await db.query("select to_regclass('private.configured_appointment_commands') is not null present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261031103126_configured_appointment_cancellation.sql',import.meta.url),'utf8'));
  if(!(await db.query("select to_regprocedure('public.read_local_configured_rescheduling(uuid,uuid,date,text)') is not null present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261031103753_configured_appointment_rescheduling.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1)',[actor]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)",[clinic,actor]);
  await db.query('update private.agenda_configuration_gates set confirmations_enabled=true,public_requests_enabled=true,api_gate_key=$2,public_api_gate_key=$2 where clinic_id=$1',[clinic,gate]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method','POST',true)",[actor]);
  const date=(await db.query("select to_char(current_date+7+((8-extract(isodow from current_date)::integer)%7),'YYYY-MM-DD') date")).rows[0].date;
  const snapshot=async()=>(await db.query('select private.agenda_availability_snapshot($1,$2) s',[clinic,date])).rows[0].s;
  const initial=await snapshot(),visit=initial.settings.visit_types.find(v=>v.active&&v.public_bookable);
  assert.ok(visit,'Run local configured agenda setup first');
  const revision=initial.settings.revision;
  const interval=async(time)=>(await db.query("select private.scheduling_time(($1::date+$2::time) at time zone 'Africa/Casablanca') starts_at,private.scheduling_time((($1::date+$2::time) at time zone 'Africa/Casablanca')+$3*interval '1 minute') ends_at",[date,time,visit.duration_minutes])).rows[0];
  const create=async(time)=>{
    await role();const times=await interval(time),snap=await snapshot();
    const payload={visit_type_id:visit.id,configuration_revision:revision,...times,contact_name:'Salma Alaoui · FICTIF',contact_email:`test-${randomUUID()}@example.test`,administrative_consent_version:'local-demo-v1'};
    await role('anon');const receipt=(await db.query('select public.create_local_configured_booking_request($1,$2,$3,$4,$5) r',[clinic,randomUUID(),payload,snap,gate])).rows[0].r;
    await role('authenticated');return {...receipt,...times};
  };
  const a=await create('09:00'),b=await create('09:00'),c=await create('10:00'),d=await create('14:00');
  const key=randomUUID();
  const confirm=async(request=a.request_id,command=key,expected=revision,capability=gate,tenant=clinic)=>(await db.query('select public.confirm_local_configured_booking_request($1,$2,$3,$4,$5) r',[tenant,request,command,expected,capability])).rows[0].r;
  await role('anon');await check('anonymous confirmation denied',()=>fails('42501',()=>confirm()));
  await role('authenticated');
  await check('foreign clinic denied',()=>fails('42501',()=>confirm(a.request_id,key,revision,gate,foreign)));
  await check('foreign or unknown request denied',()=>fails('SH404',()=>confirm(randomUUID())));
  await check('wrong capability denied',()=>fails('PT503',()=>confirm(a.request_id,key,revision,'wrong')));
  await check('stale configuration revision denied',()=>fails('SH409',()=>confirm(a.request_id,key,revision+1)));
  await role();await db.query('update private.agenda_configuration_gates set confirmations_enabled=false where clinic_id=$1',[clinic]);await role('authenticated');
  await check('disabled local gate denied',()=>fails('PT503',()=>confirm()));
  await role();await db.query('update private.agenda_configuration_gates set confirmations_enabled=true where clinic_id=$1',[clinic]);
  await db.query("update public.clinic_memberships set role='assistant' where user_id=$1",[actor]);await role('authenticated');
  await check('assistant cannot confirm',()=>fails('42501',()=>confirm()));
  await role();await db.query("update public.clinic_memberships set role='reception' where user_id=$1",[actor]);await role('authenticated');
  let receipt;
  await check('reception confirms with an immutable receipt',async()=>{receipt=await confirm();assert.equal(receipt.status,'confirmed');assert.equal(receipt.replayed,false);assert.equal(receipt.request_id,a.request_id);});
  await check('lost response replays the same appointment',async()=>assert.deepEqual(await confirm(),{...receipt,replayed:true}));
  await check('key reuse for another request rejected',()=>fails('SH410',()=>confirm(b.request_id)));
  await check('duplicate confirmation with new key rejected',()=>fails('SH409',()=>confirm(a.request_id,randomUUID())));
  await check('competing request cannot double book',()=>fails('SH409',()=>confirm(b.request_id,randomUUID())));
  await check('reception projection exposes authoritative confirmed appointment',async()=>{
    const list=(await db.query('select public.list_local_configured_booking_requests($1) r',[clinic])).rows[0].r;
    const row=list.items.find(item=>item.id===a.request_id);assert.equal(row.status,'confirmed');assert.equal(row.appointment.id,receipt.appointment_id);assert.equal(list.current_revision,revision);assert.equal(list.confirmation_enabled,true);
  });
  await check('calendar includes configured contact without inventing a patient link',async()=>{
    const list=(await db.query('select public.list_local_patient_appointments($1,$2,$2) r',[clinic,date])).rows[0].r;
    const row=list.items.find(item=>item.id===receipt.appointment_id);assert.equal(row.source,'configured');assert.equal(row.patient,null);assert.equal(row.contact_name,'Salma Alaoui · FICTIF');assert.equal(row.status,'confirmed');
  });
  await check('foreign calendar read denied',()=>fails('42501',()=>db.query('select public.list_local_patient_appointments($1,$2,$2)',[foreign,date])));
  await role();
  await check('buffered occupancy audit and outbox persisted once',async()=>{
    const row=(await db.query('select (select count(*)::int from private.scheduling_occupancy where appointment_id=$1 and active) occupancy,(select count(*)::int from private.audit_events where correlation_id=$2) audit,(select count(*)::int from private.outbox_events where correlation_id=$2) outbox',[receipt.appointment_id,key])).rows[0];
    assert.deepEqual(row,{occupancy:2,audit:1,outbox:1});
    const appointment=(await db.query('select * from private.configured_appointments where id=$1',[receipt.appointment_id])).rows[0];
    assert.equal(appointment.busy_ends_at-appointment.ends_at,visit.buffer_after_minutes*60000);
    const outbox=(await db.query('select payload from private.outbox_events where correlation_id=$1',[key])).rows[0].payload;
    assert.ok(!JSON.stringify(outbox).includes('Salma'));assert.ok(!JSON.stringify(outbox).includes('example.test'));
  });
  await check('public availability snapshot includes appointment buffers',async()=>{
    const after=await snapshot();assert.equal(after.occupancy.filter(o=>o.period.starts_at===a.starts_at).length,2);
  });
  await role('authenticated');
  const pair=visit.resource_pairs[0];
  const holdBody={provider_resource_id:pair.provider_id,chair_resource_id:pair.chair_id,starts_at:a.starts_at,ends_at:a.ends_at,display_timezone:'Africa/Casablanca'};
  await check('temporary hold cannot overlap confirmed appointment',()=>fails('SH409',()=>db.query('select public.scheduling_create_hold($1,$2,$3,$4)',[clinic,randomUUID(),holdBody,randomUUID()])));
  await check('temporary availability excludes confirmed appointment',async()=>{
    const body={provider_resource_id:pair.provider_id,chair_resource_id:pair.chair_id,window_starts_at:a.starts_at,window_ends_at:a.ends_at,display_timezone:'Africa/Casablanca'};
    const value=(await db.query('select public.scheduling_availability($1,$2) r',[clinic,body])).rows[0].r;
    assert.deepEqual(value.intervals,[]);
  });
  const hold=(await db.query('select public.scheduling_create_hold($1,$2,$3,$4) r',[clinic,randomUUID(),{...holdBody,starts_at:c.starts_at,ends_at:c.ends_at},randomUUID()])).rows[0].r.item;
  await check('live temporary hold prevents confirmation',()=>fails('SH409',()=>confirm(c.request_id,randomUUID())));
  await role();await db.query("update private.scheduling_holds set expires_at=clock_timestamp()-interval '1 second' where id=$1",[hold.id]);await role('authenticated');
  await check('expired hold is cleaned before confirmation',async()=>assert.equal((await confirm(c.request_id,randomUUID())).status,'confirmed'));
  await role();
  await db.query("create function private.fail_configured_confirmation_test() returns trigger language plpgsql as $$begin if new.event_type='ConfiguredBookingConfirmed' then raise exception 'synthetic failure';end if;return new;end$$;create trigger fail_configured_confirmation_test before insert on private.outbox_events for each row execute function private.fail_configured_confirmation_test()");
  const failedKey=randomUUID();await role('authenticated');
  await check('outbox failure aborts entire confirmation',()=>fails('P0001',()=>confirm(d.request_id,failedKey)));
  await role();
  await check('failed transaction retains neither appointment nor receipt',async()=>{
    assert.equal((await db.query('select count(*)::int n from private.configured_appointments where request_id=$1',[d.request_id])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from private.configured_booking_confirmations where command_key=$1',[failedKey])).rows[0].n,0);
  });
  const cancelKey=randomUUID();
  // A separate appointment exercises moving without changing the cancellation fixture.
  await db.query("create or replace function private.fail_configured_confirmation_test() returns trigger language plpgsql as $$begin return new;end$$");
  await role('authenticated');const movable=await confirm(d.request_id,randomUUID());await role();
  const destination=await interval('15:00'),moveKey=randomUUID();
  const move=async(times=destination,key=moveKey,version=1,rev=revision)=>(await db.query('select public.reschedule_local_configured_appointment($1,$2,$3,$4,$5,$6,$7,$8) r',[clinic,movable.appointment_id,version,key,rev,times.starts_at,times.ends_at,gate])).rows[0].r;
  await role('authenticated');
  await check('reschedule snapshot excludes own occupancy but retains other appointments',async()=>{
    const result=(await db.query('select public.read_local_configured_rescheduling($1,$2,$3,$4) r',[clinic,movable.appointment_id,date,gate])).rows[0].r;
    assert.equal(result.version,1);assert.equal(result.visit_type_id,visit.id);assert.ok(!result.snapshot.occupancy.some(o=>o.period.starts_at===d.starts_at));assert.ok(result.snapshot.occupancy.some(o=>o.period.starts_at===a.starts_at));
  });
  await check('moving onto another appointment conflicts',()=>fails('SH409',()=>move(c)));
  await check('moving with stale configuration conflicts',()=>fails('SH409',()=>move(destination,moveKey,1,revision+1)));
  await check('moving with stale version conflicts',()=>fails('SH409',()=>move(destination,moveKey,2)));
  await check('moving outside opening hours conflicts',()=>fails('SH409',()=>move({starts_at:`${date}T03:00:00Z`,ends_at:`${date}T03:30:00Z`})));
  await role();await db.query("create or replace function private.fail_configured_confirmation_test() returns trigger language plpgsql as $$begin if new.event_type='ConfiguredAppointmentRescheduled' then raise exception 'synthetic failure';end if;return new;end$$");await role('authenticated');
  await check('reschedule event failure rolls back',()=>fails('P0001',()=>move()));
  await role();await check('failed move preserves previous time and occupancy',async()=>{
    assert.equal((await db.query('select starts_at from private.configured_appointments where id=$1',[movable.appointment_id])).rows[0].starts_at.toISOString(),d.starts_at);
    assert.equal((await db.query('select count(*)::int n from private.scheduling_occupancy where appointment_id=$1 and active and lower(period)=$2',[movable.appointment_id,d.starts_at])).rows[0].n,2);
  });
  await db.query("create or replace function private.fail_configured_confirmation_test() returns trigger language plpgsql as $$begin return new;end$$");await role('authenticated');
  await check('move updates once and replays exact receipt',async()=>{const result=await move();assert.equal(result.version,2);assert.equal(result.starts_at,destination.starts_at);assert.deepEqual(await move(),{...result,replayed:true});});
  await check('changed move payload cannot reuse key',()=>fails('SH410',()=>move(d)));
  await check('reception reflects moved time and original request stays immutable',async()=>{
    const result=(await db.query('select public.list_local_configured_booking_requests($1) r',[clinic])).rows[0].r;assert.equal(result.items.find(r=>r.id===d.request_id).starts_at,destination.starts_at);
  });
  await role();await check('move swaps buffered occupancy with one event',async()=>{
    assert.equal((await db.query('select starts_at from private.configured_booking_requests where id=$1',[d.request_id])).rows[0].starts_at.toISOString(),d.starts_at);
    assert.equal((await db.query('select count(*)::int n from private.scheduling_occupancy where appointment_id=$1 and active and lower(period)=$2',[movable.appointment_id,destination.starts_at])).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from private.outbox_events where correlation_id=$1',[moveKey])).rows[0].n,1);
  });
  const cancel=async(id=receipt.appointment_id,version=1,key=cancelKey,tenant=clinic,capability=gate)=>(await db.query('select public.cancel_local_configured_appointment($1,$2,$3,$4,$5) r',[tenant,id,version,key,capability])).rows[0].r;
  await role('anon');await check('anonymous cancellation denied',()=>fails('42501',()=>cancel()));
  await role('authenticated');
  await check('foreign cancellation denied',()=>fails('42501',()=>cancel(receipt.appointment_id,1,cancelKey,foreign)));
  await check('unknown appointment cancellation denied',()=>fails('SH404',()=>cancel(randomUUID())));
  await check('wrong cancellation gate denied',()=>fails('PT503',()=>cancel(receipt.appointment_id,1,cancelKey,clinic,'wrong')));
  await check('stale cancellation version denied',()=>fails('SH409',()=>cancel(receipt.appointment_id,2)));
  await role();await db.query("update public.clinic_memberships set role='assistant' where user_id=$1",[actor]);await role('authenticated');
  await check('assistant cancellation denied',()=>fails('42501',()=>cancel()));
  await role();await db.query("update public.clinic_memberships set role='reception' where user_id=$1",[actor]);
  await db.query("create or replace function private.fail_configured_confirmation_test() returns trigger language plpgsql as $$begin if new.event_type='ConfiguredAppointmentCancelled' then raise exception 'synthetic failure';end if;return new;end$$");await role('authenticated');
  await check('cancellation outbox failure aborts all changes',()=>fails('P0001',()=>cancel()));
  await role();
  await check('failed cancellation retains reservation and has no receipt',async()=>{
    assert.equal((await db.query('select status from private.configured_appointments where id=$1',[receipt.appointment_id])).rows[0].status,'confirmed');
    assert.equal((await db.query('select count(*)::int n from private.scheduling_occupancy where appointment_id=$1 and active',[receipt.appointment_id])).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from private.configured_appointment_commands where request_key=$1',[cancelKey])).rows[0].n,0);
  });
  await db.query('drop trigger fail_configured_confirmation_test on private.outbox_events');await role('authenticated');
  let cancelled;
  await check('cancellation increments version and replays immutably',async()=>{cancelled=await cancel();assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.version,2);assert.deepEqual(await cancel(),{...cancelled,replayed:true});});
  await check('cancellation changed-key payload denied',()=>fails('SH410',()=>cancel(receipt.appointment_id,2)));
  await check('already-cancelled appointment cannot cancel again',()=>fails('SH409',()=>cancel(receipt.appointment_id,2,randomUUID())));
  await check('replayed confirmation cannot resurrect cancelled state',async()=>{
    assert.equal((await confirm()).status,'confirmed'); // Immutable historical receipt only.
    const list=(await db.query('select public.list_local_configured_booking_requests($1) r',[clinic])).rows[0].r;
    assert.equal(list.items.find(item=>item.id===a.request_id).status,'cancelled');
  });
  await role();
  await check('cancel frees occupancy with one audit and outbox',async()=>{
    assert.equal((await db.query('select count(*)::int n from private.scheduling_occupancy where appointment_id=$1 and active',[receipt.appointment_id])).rows[0].n,0);
    assert.deepEqual((await db.query('select (select count(*)::int from private.audit_events where correlation_id=$1) audit,(select count(*)::int from private.outbox_events where correlation_id=$1) outbox',[cancelKey])).rows[0],{audit:1,outbox:1});
  });
  await role('authenticated');await check('another request can reserve the released slot',async()=>assert.equal((await confirm(b.request_id,randomUUID())).status,'confirmed'));
  await role();await db.query('update public.clinic_memberships set active=false where user_id=$1',[actor]);await role('authenticated');
  await check('revoked membership cannot replay cancellation',()=>fails('42501',()=>cancel()));
  await check('revoked membership cannot recover prior receipt',()=>fails('42501',()=>confirm()));
  await check('authenticated direct table access denied',()=>fails('42501',()=>db.query('select * from private.configured_appointments')));
  console.log(`${checks} native confirmation checks passed; all test changes rolled back.`);
}finally{await db.query('rollback');await db.end();}
