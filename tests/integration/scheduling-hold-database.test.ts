import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { SchedulingHoldCreatedResponseSchema, SchedulingHoldResponseSchema, SchedulingHoldReleasedResponseSchema, SchedulingAvailabilityResponseSchema, SchedulingResourceListResponseSchema, SchedulingHoldEventSchema } from '../../packages/contracts/src/scheduling-hold';
const clinic='71000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000001';
const provider='72000000-0000-4000-8000-000000000001',provider2='72000000-0000-4000-8000-000000000002',chair='72000000-0000-4000-8000-000000000003',chair2='72000000-0000-4000-8000-000000000004';
describe('synthetic scheduling SQL transactions',()=>{
 let db:PGlite;
 const base=()=>{const start=new Date(Date.now()+3600000);return {provider_resource_id:provider,chair_resource_id:chair,starts_at:start.toISOString(),ends_at:new Date(+start+1800000).toISOString(),display_timezone:'Africa/Casablanca'};};
 beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}});
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  await db.exec(readFileSync('supabase/migrations/20261026131434_foundation.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261026155853_scheduling_hold.sql','utf8'));
  await db.exec(`insert into auth.users values('${user}');insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${clinic}','${user}','reception',true)`);
 },30000);
 afterAll(async()=>{await db?.close();});
 beforeEach(async()=>{await db.exec(`delete from private.scheduling_idempotency;delete from private.scheduling_occupancy;delete from private.scheduling_holds;delete from private.outbox_events;delete from private.audit_events;update private.scheduling_settings set enabled=true,max_hold_seconds=7200;update private.scheduling_resources set active=true;delete from public.clinic_memberships;insert into public.clinic_memberships(clinic_id,user_id,role,active) values('${clinic}','${user}','reception',true);`);});
 async function rpc(name:string,args:unknown[],subject=user,method='POST') {
  return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method',$2,true)",[subject,method]);return (await tx.query<{result:unknown}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0]!.result;});
 }
 const create=async(body=base(),key=randomUUID())=>SchedulingHoldCreatedResponseSchema.parse(await rpc('scheduling_create_hold',[clinic,key,JSON.stringify(body),randomUUID()]));
 const get=async(id:string)=>SchedulingHoldResponseSchema.parse(await rpc('scheduling_get_hold',[clinic,id]));
 const release=async(id:string,key=randomUUID())=>SchedulingHoldReleasedResponseSchema.parse(await rpc('scheduling_release_hold',[clinic,id,key,randomUUID()]));
 it('keeps gates and direct grants authoritative, including GET RPC denial',async()=>{
  await db.exec('update private.scheduling_settings set enabled=false');
  await expect(rpc('scheduling_resources',[clinic])).rejects.toMatchObject({code:'PT503'});
  await db.exec('update private.scheduling_settings set enabled=true');
  await expect(rpc('scheduling_resources',[clinic],'')).rejects.toMatchObject({code:'28000'});
  await expect(rpc('scheduling_resources',[clinic],user,'GET')).rejects.toMatchObject({code:'22023'});
  for(const role of ['assistant','reception']) {await db.query('update public.clinic_memberships set role=$1,active=$2',[role,role==='assistant']);await expect(rpc('scheduling_resources',[clinic])).rejects.toMatchObject({code:'42501'});}
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','private.scheduling_holds','INSERT') allowed")).rows[0]?.allowed).toBe(false);
 });
 it('lists only synthetic minimal resources and computes free intervals',async()=>{
  const list=SchedulingResourceListResponseSchema.parse(await rpc('scheduling_resources',[clinic]));expect(list.items).toHaveLength(4);
  const body=base();await create(body);
  const availability=SchedulingAvailabilityResponseSchema.parse(await rpc('scheduling_availability',[clinic,JSON.stringify({provider_resource_id:provider,chair_resource_id:chair,window_starts_at:body.starts_at,window_ends_at:new Date(Date.parse(body.ends_at)+1800000).toISOString(),display_timezone:body.display_timezone})]));
  expect(availability.intervals).toEqual([{starts_at:body.ends_at,ends_at:new Date(Date.parse(body.ends_at)+1800000).toISOString()}]);
 });
 it('excludes both shared providers and shared chairs atomically; adjacent intervals work',async()=>{
  const body=base();await create(body);
  await expect(create({...body,chair_resource_id:chair2})).rejects.toMatchObject({code:'SH409'});
  await expect(create({...body,provider_resource_id:provider2})).rejects.toMatchObject({code:'SH409'});
  expect((await db.query('select * from private.scheduling_holds')).rows).toHaveLength(1);
  expect((await db.query('select * from private.scheduling_occupancy')).rows).toHaveLength(2);
  await create({...body,starts_at:body.ends_at,ends_at:new Date(Date.parse(body.ends_at)+1800000).toISOString()});
  expect((await db.query('select * from private.outbox_events')).rows).toHaveLength(2);
 });
 it('replays immutable receipts before resource/config changes and binds release keys to targets',async()=>{
  const body=base(),key=randomUUID(),first=await create(body,key);await release(first.item.id);
  await db.exec('update private.scheduling_resources set active=false;update private.scheduling_settings set max_hold_seconds=1');
  await db.exec("set timezone='Pacific/Honolulu'");
  expect(await create(body,key)).toEqual({...first,replayed:true});
  await expect(create({...body,display_timezone:'UTC'},key)).rejects.toMatchObject({code:'SH410'});
  const releaseKey=randomUUID();expect((await release(first.item.id,releaseKey)).transitioned).toBe(false);
  await expect(release(randomUUID(),releaseKey)).rejects.toMatchObject({code:'SH410'});
 });
 it('returns original release transition on replay but no duplicate event on a fresh key',async()=>{
  const first=await create(),key=randomUUID(),released=await release(first.item.id,key);
  expect(released.transitioned).toBe(true);expect(await release(first.item.id,key)).toEqual({...released,replayed:true});
  expect((await release(first.item.id)).transitioned).toBe(false);
  expect((await db.query("select * from private.outbox_events where event_type='SlotHoldReleased'")).rows).toHaveLength(1);
 });
 it('projects expiry immediately; subsequent cleanup emits once with system actor and frees capacity',async()=>{
  const body=base(),held=await create(body);
  await db.query("update private.scheduling_holds set expires_at=clock_timestamp()-interval '1 second' where id=$1",[held.item.id]);
  expect((await get(held.item.id)).item.status).toBe('expired');
  await expect(release(held.item.id)).rejects.toMatchObject({code:'SH411'});
  await create(body);
  const events=(await db.query<{actor_ref:string}>("select actor_ref from private.outbox_events where event_type='SlotHoldExpired'")).rows;
  expect(events).toEqual([{actor_ref:'00000000-0000-4000-8000-000000000001'}]);
  expect((await get(held.item.id)).item.version).toBe(2);
 });
 it('rejects extra/private fields, bad times, excessive precision, wrong kinds and foreign references',async()=>{
  const body=base();
  for(const malformed of [{...body,patient_id:randomUUID()},{...body,starts_at:body.ends_at},{...body,starts_at:body.starts_at.replace('Z','1Z')},{...body,display_timezone:'invented'},{...body,starts_at:'tomorrow'}]) await expect(create(malformed)).rejects.toMatchObject({code:'22023'});
  await expect(create({...body,provider_resource_id:chair})).rejects.toMatchObject({code:'SH404'});
  await expect(create({...body,chair_resource_id:randomUUID()})).rejects.toMatchObject({code:'SH404'});
  await expect(get(randomUUID())).rejects.toMatchObject({code:'SH405'});
 });
 it.each(['audit_events','outbox_events','scheduling_idempotency'])('rolls back every write if %s insertion fails',async(sink)=>{
  await db.exec(`create function private.reject_test_event() returns trigger language plpgsql as $$begin raise exception 'synthetic sink failure';end$$;create trigger reject_test_event before insert on private.${sink} for each row execute function private.reject_test_event()`);
  try {await expect(create()).rejects.toMatchObject({code:'P0001'});for(const table of ['scheduling_holds','scheduling_occupancy','scheduling_idempotency','audit_events','outbox_events']) expect((await db.query(`select * from private.${table}`)).rows).toHaveLength(0);}
  finally {await db.exec(`drop trigger reject_test_event on private.${sink};drop function private.reject_test_event()`);}
 });
 it('enforces active resources, configured duration/horizon and both availability windows',async()=>{
  const body=base();await db.query('update private.scheduling_resources set active=false where id=$1',[chair]);
  await expect(create(body)).rejects.toMatchObject({code:'SH404'});await db.query('update private.scheduling_resources set active=true where id=$1',[chair]);
  await expect(create({...body,ends_at:new Date(Date.parse(body.starts_at)+3*3600000).toISOString()})).rejects.toMatchObject({code:'22023'});
  await expect(create({...body,starts_at:'2100-01-01T00:00:00.000Z',ends_at:'2100-01-01T00:30:00.000Z'})).rejects.toMatchObject({code:'22023'});
  await db.query('update private.scheduling_windows set starts_at=$1 where resource_id=$2',[body.ends_at,chair]);
  await expect(create(body)).rejects.toMatchObject({code:'SH409'});
  await db.query("update private.scheduling_windows set starts_at='2020-01-01Z' where resource_id=$1",[chair]);
 });
 it('normalizes offset-equivalent instants across session timezones and persists the frozen event envelope',async()=>{
  const body=base(),key=randomUUID(),first=await create(body,key);
  const offset=(value:string)=>new Date(Date.parse(value)+3600000).toISOString().replace('Z','+01:00');
  await db.exec("set timezone='Asia/Tokyo'");
  expect(await create({...body,starts_at:offset(body.starts_at),ends_at:offset(body.ends_at)},key)).toEqual({...first,replayed:true});
  const event=(await db.query<{event:unknown}>(`select jsonb_build_object('event_id',event_id,'event_type',event_type,'event_version',event_version,'clinic_id',clinic_id,'aggregate_type',aggregate_type,'aggregate_id',aggregate_id,'actor_ref',actor_ref,'correlation_id',correlation_id,'occurred_at',private.scheduling_time(occurred_at),'payload',payload) event from private.outbox_events`)).rows[0]!.event;
  expect(SchedulingHoldEventSchema.parse(event).aggregate_id).toBe(first.item.id);
 });
 it('does not disclose resources or holds in another authorized clinic and scopes idempotency by actor',async()=>{
  const other=randomUUID(),otherUser=randomUUID();
  await db.query('insert into public.clinics(id,name) values($1,$2)',[other,'Synthetic foreign']);
  await db.query('insert into private.scheduling_settings(clinic_id,enabled) values($1,true)',[other]);
  await db.query('insert into auth.users values($1)',[otherUser]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true),($3,$2,'dentist',true)",[other,user,clinic]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)",[clinic,otherUser]);
  const body=base(),key=randomUUID(),held=await create(body,key);
  await expect(rpc('scheduling_get_hold',[other,held.item.id])).rejects.toMatchObject({code:'SH405'});
  await expect(rpc('scheduling_create_hold',[other,randomUUID(),JSON.stringify(body),randomUUID()])).rejects.toMatchObject({code:'SH404'});
  await expect(rpc('scheduling_create_hold',[clinic,key,JSON.stringify(body),randomUUID()],otherUser)).rejects.toMatchObject({code:'SH409'});
 });
 it('bounds resources and availability with explicit truncation rather than silent omission',async()=>{
  await db.query("insert into private.scheduling_resources(clinic_id,kind,display_name) select $1,'provider','Synthetic extra '||n from generate_series(1,101)n",[clinic]);
  const resources=SchedulingResourceListResponseSchema.parse(await rpc('scheduling_resources',[clinic]));expect(resources.items).toHaveLength(100);expect(resources.truncated).toBe(true);
  const body=base();
  await db.query('delete from private.scheduling_windows where resource_id=$1',[provider]);
  await db.query("insert into private.scheduling_windows(clinic_id,resource_id,starts_at,ends_at) select $1,$2,$3::timestamptz+n*interval '2 minutes',$3::timestamptz+n*interval '2 minutes'+interval '1 minute' from generate_series(0,200)n",[clinic,provider,body.starts_at]);
  const result=SchedulingAvailabilityResponseSchema.parse(await rpc('scheduling_availability',[clinic,JSON.stringify({provider_resource_id:provider,chair_resource_id:chair,window_starts_at:body.starts_at,window_ends_at:new Date(Date.parse(body.starts_at)+24*3600000).toISOString(),display_timezone:'UTC'})]));
  expect(result.intervals).toHaveLength(200);expect(result.truncated).toBe(true);
 });
});
