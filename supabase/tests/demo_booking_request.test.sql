begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(19);

insert into public.clinics(id,name) values
  ('10000000-0000-4000-8000-000000000001','Cabinet Atlas (FICTIF)'),
  ('10000000-0000-4000-8000-000000000002','Cabinet Sourire (FICTIF)')
on conflict (id) do nothing;

insert into auth.users(id) values
  ('86000000-0000-4000-8000-000000000001'),
  ('86000000-0000-4000-8000-000000000002');
-- Live synthetic sessions for authenticated fixture actors.
insert into auth.sessions(id,user_id,not_after) values('86000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000002',now()+interval '1 hour');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
  ('10000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001','reception',true),
  ('10000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','assistant',true);

select is((select enabled from private.demo_booking_request_settings where singleton),false,'database booking-request gate defaults off');
select ok(not has_table_privilege('anon','private.demo_booking_requests','SELECT'),'anonymous cannot directly read request table');
select ok(not has_table_privilege('authenticated','private.demo_booking_requests','INSERT'),'staff cannot directly create public requests');
select ok(has_function_privilege('anon','public.create_demo_booking_request(uuid,text,text,text,text)','EXECUTE'),'anonymous can call the narrow public-request function');
select ok(not has_function_privilege('authenticated','public.create_demo_booking_request(uuid,text,text,text,text)','EXECUTE'),'authenticated staff cannot use public creation function');
select ok(not has_function_privilege('anon','public.list_demo_booking_requests(uuid)','EXECUTE'),'anonymous cannot list requests');

select set_config('request.method','POST',true);
set local role anon;
select throws_ok($$select public.create_demo_booking_request('87000000-0000-4000-8000-000000000001','salma',current_date::text,'09:30','local-test-gate-key')$$,'42501',null,'disabled database gate denies anonymous write');
reset role;
update private.demo_booking_request_settings set enabled=true,api_gate_key='local-test-gate-key' where singleton;
select is(private.demo_booking_request_writes_enabled(),true,'database setting change is visible to the gate');
set local role anon;
select throws_ok($$select public.create_demo_booking_request('87000000-0000-4000-8000-000000000001','salma',current_date::text,'09:30','wrong-gate-key')$$,'42501',null,'API gate key is independently required');
select is(public.create_demo_booking_request('87000000-0000-4000-8000-000000000001','salma',current_date::text,'09:30','local-test-gate-key')->>'status','request_received','fictional request is acknowledged with a neutral status');
select is(public.create_demo_booking_request('87000000-0000-4000-8000-000000000001','salma',current_date::text,'09:30','local-test-gate-key')->>'status','request_received','idempotent replay receives the same neutral acknowledgement');
select throws_ok($$select public.create_demo_booking_request('87000000-0000-4000-8000-000000000002','unknown',current_date::text,'09:30','local-test-gate-key')$$,'22023',null,'unknown scenario is rejected');
reset role;

select is((select count(*)::integer from private.demo_booking_requests),1,'idempotency creates only one durable request');
select is((select count(*)::integer from private.audit_events where action='DemoBookingRequestReceived'),1,'one successful write emits one audit row');
select is((select count(*)::integer from private.outbox_events where event_type='DemoBookingRequestReceived'),1,'one successful write emits one outbox event');
select is((select payload from private.outbox_events where event_type='DemoBookingRequestReceived'),
  jsonb_build_object('scenario_id','salma','requested_date',current_date,'requested_time','09:30','status','request_received'),
  'outbox contains only bounded synthetic request fields');

select set_config('request.jwt.claim.sub','86000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select is((select count(*)::integer from public.list_demo_booking_requests('10000000-0000-4000-8000-000000000001')),
  1,'same-clinic receptionist can review a synthetic request');
select is((select count(*)::integer from public.list_demo_booking_requests('10000000-0000-4000-8000-000000000002')),
  0,'foreign clinic request projection is empty');
reset role;
select set_config('request.jwt.claim.sub','86000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select is((select count(*)::integer from public.list_demo_booking_requests('10000000-0000-4000-8000-000000000001')),
  0,'assistant role receives no rows');
reset role;

select * from finish();
rollback;
