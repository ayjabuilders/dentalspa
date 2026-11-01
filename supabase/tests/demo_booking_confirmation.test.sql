begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(37);

insert into public.clinics(id,name) values
 ('10000000-0000-4000-8000-000000000001','Cabinet Atlas (FICTIF)'),
 ('10000000-0000-4000-8000-000000000002','Cabinet Sourire (FICTIF)')
on conflict (id) do nothing;
insert into private.demo_booking_sample_resources(id,clinic_id,kind,display_name) values
 ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo A'),
 ('73000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo B'),
 ('73000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo A'),
 ('73000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo B')
on conflict (id) do nothing;

insert into auth.users(id) values
 ('75000000-0000-4000-8000-000000000001'),
 ('75000000-0000-4000-8000-000000000002'),
 ('75000000-0000-4000-8000-000000000003'),
 ('75000000-0000-4000-8000-000000000004'),
 ('75000000-0000-4000-8000-000000000005');
-- Live synthetic sessions for authenticated fixture actors.
insert into auth.sessions(id,user_id,not_after) values('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000002',now()+interval '1 hour'),('75000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000003',now()+interval '1 hour'),('75000000-0000-4000-8000-000000000004','75000000-0000-4000-8000-000000000004',now()+interval '1 hour'),('75000000-0000-4000-8000-000000000005','75000000-0000-4000-8000-000000000005',now()+interval '1 hour');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('10000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','reception',true),
 ('10000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','assistant',true),
 ('10000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000003','manager',true),
 ('10000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000004','manager',true),
 ('10000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000005','manager',false);
with dates as (
 select current_date + ((3 - extract(isodow from current_date)::int + 7) % 7 + 1) as weekday
)
insert into private.demo_booking_requests(id,request_key,scenario_id,requested_date,requested_time)
select '76000000-0000-4000-8000-000000000001'::uuid,'76100000-0000-4000-8000-000000000001'::uuid,'salma',weekday,time '09:30' from dates
union all select '76000000-0000-4000-8000-000000000002'::uuid,'76100000-0000-4000-8000-000000000002'::uuid,'youssef',weekday,time '09:30' from dates
union all select '76000000-0000-4000-8000-000000000003'::uuid,'76100000-0000-4000-8000-000000000003'::uuid,'imane',weekday,time '09:30' from dates
union all select '76000000-0000-4000-8000-000000000004'::uuid,'76100000-0000-4000-8000-000000000004'::uuid,'salma',weekday,time '08:30' from dates
union all select '76000000-0000-4000-8000-000000000005'::uuid,'76100000-0000-4000-8000-000000000005'::uuid,'imane',weekday+7,time '09:30' from dates
union all select '76000000-0000-4000-8000-000000000006'::uuid,'76100000-0000-4000-8000-000000000006'::uuid,'salma',current_date + case when extract(isodow from current_date)=7 then 7 else 7-extract(isodow from current_date)::int end,time '09:30' from dates
union all select '76000000-0000-4000-8000-000000000007'::uuid,'76100000-0000-4000-8000-000000000007'::uuid,'youssef',weekday+14,time '09:30' from dates;

update private.demo_booking_confirmation_settings set enabled=false,api_gate_key='' where singleton;
select is((select enabled from private.demo_booking_confirmation_settings where singleton),false,'database confirmation gate defaults off');
select ok(not has_table_privilege('anon','private.demo_confirmed_appointments','SELECT'),'anonymous cannot read appointment rows directly');
select ok(not has_table_privilege('authenticated','private.demo_confirmed_appointments','INSERT'),'staff cannot insert appointment rows directly');
select ok(not has_table_privilege('authenticated','private.demo_booking_confirmation_idempotency','SELECT'),'staff cannot read idempotency receipts directly');
select ok(has_function_privilege('authenticated','public.confirm_demo_booking_request(uuid,uuid,uuid,uuid,uuid,text)','EXECUTE'),'authenticated staff can invoke the guarded confirmation RPC');
select ok(not has_function_privilege('anon','public.confirm_demo_booking_request(uuid,uuid,uuid,uuid,uuid,text)','EXECUTE'),'anonymous cannot invoke confirmation');
select ok(not has_function_privilege('service_role','public.confirm_demo_booking_request(uuid,uuid,uuid,uuid,uuid,text)','EXECUTE'),'service role has no direct RPC shortcut');
select ok((select prosecdef from pg_proc where oid='public.confirm_demo_booking_request(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure),'confirmation RPC uses a definer boundary');
select ok(exists(select 1 from information_schema.columns where table_schema='private' and table_name='demo_confirmed_appointments' and column_name='patient_id' and is_nullable='YES') and not exists(select 1 from information_schema.columns where table_schema='private' and table_name='demo_confirmed_appointments' and column_name='contact_id'),'patient association is optional and no contact association exists');

select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000001','wrong-key')$$,'PT503',null,'default-off database gate denies confirmation');
reset role;
update private.demo_booking_confirmation_settings set enabled=true,api_gate_key='local-confirm-test-key' where singleton;
set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000001','wrong-key')$$,'PT503',null,'API gate key is independently required');
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000001','local-confirm-test-key')$$,'22023',null,'foreign clinic cannot select the demo clinic by caller ID');
select is(public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000001','local-confirm-test-key')->>'status','confirmed','active receptionist confirms a synthetic request');
select is(public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000001','local-confirm-test-key')->>'replayed','true','exact retry returns the stored confirmation receipt');
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000004','76200000-0000-4000-8000-000000000001','local-confirm-test-key')$$,'SH410',null,'same key with different resources is rejected');
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000004','76200000-0000-4000-8000-000000000002','local-confirm-test-key')$$,'SH412',null,'a request cannot be confirmed twice using a new key');
select is((select status from public.list_demo_booking_requests('10000000-0000-4000-8000-000000000001') where id='76000000-0000-4000-8000-000000000001'),'confirmed','staff inbox derives confirmed state from appointment record');
select ok((select appointment->>'id' is not null from public.list_demo_booking_requests('10000000-0000-4000-8000-000000000001') where id='76000000-0000-4000-8000-000000000001'),'same-clinic staff sees the appointment projection');
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000003','local-confirm-test-key')$$,'SH409',null,'overlapping provider and chair are protected');
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000004','local-confirm-test-key')$$,'SH409',null,'overlapping chair is protected even with a different provider');
select is(public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000004','76200000-0000-4000-8000-000000000005','local-confirm-test-key')->>'status','confirmed','non-overlapping sample resources can accept another appointment');
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000006','local-confirm-test-key')$$,'SH409',null,'a provider collision remains rejected across requests');
reset role;
select is((select count(*)::int from private.demo_confirmed_appointments where booking_request_id in ('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000003')),2,'only the two accepted requests have appointments');
select is((select count(*)::int from private.audit_events where action='DemoAppointmentConfirmed' and aggregate_id in (select id from private.demo_confirmed_appointments where booking_request_id in ('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002'))),2,'each confirmation emits one scoped audit event');
select is((select count(*)::int from private.outbox_events where event_type='DemoAppointmentConfirmed' and aggregate_id in (select id from private.demo_confirmed_appointments where booking_request_id in ('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002'))),2,'each confirmation emits one scoped outbox event');
select ok(not exists(select 1 from private.outbox_events where event_type='DemoAppointmentConfirmed' and aggregate_id in (select id from private.demo_confirmed_appointments where booking_request_id in ('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002')) and payload::text ~* '(phone|email|patient|contact|clinical)'),'outbox contains no contact, patient or clinical fields');
reset role;

set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000009','local-confirm-test-key')$$,'22023',null,'sample hours are enforced by the database');
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000006','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000010','local-confirm-test-key')$$,'22023',null,'Sunday is rejected by the sample calendar');
reset role;

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000011','local-confirm-test-key')$$,'28000',null,'missing authenticated identity is denied');
reset role;

select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000007','local-confirm-test-key')$$,'42501',null,'assistant cannot confirm a booking');
reset role;
select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000008','local-confirm-test-key')$$,'42501',null,'foreign clinic member cannot confirm an Atlas request');
reset role;
select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000012','local-confirm-test-key')$$,'42501',null,'inactive manager membership is denied');
reset role;

select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select is(public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000013','local-confirm-test-key')->>'status','confirmed','active same-clinic manager can confirm a synthetic request');
reset role;

create function private.fail_demo_confirmation_outbox() returns trigger language plpgsql set search_path='' as $$
begin
  if new.event_type='DemoAppointmentConfirmed' then raise exception 'synthetic outbox failure'; end if;
  return new;
end
$$;
create trigger fail_demo_confirmation_outbox before insert on private.outbox_events
  for each row execute function private.fail_demo_confirmation_outbox();
select set_config('request.jwt.claim.sub','75000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select throws_ok($$select public.confirm_demo_booking_request('10000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000007','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','76200000-0000-4000-8000-000000000014','local-confirm-test-key')$$,'P0001',null,'outbox failure aborts confirmation');
reset role;
drop trigger fail_demo_confirmation_outbox on private.outbox_events;
drop function private.fail_demo_confirmation_outbox();
select is((select count(*)::int from private.demo_confirmed_appointments where booking_request_id='76000000-0000-4000-8000-000000000007'),0,'outbox failure rolls back the appointment');
select is((select count(*)::int from private.demo_booking_confirmation_idempotency where booking_request_id='76000000-0000-4000-8000-000000000007'),0,'outbox failure rolls back the idempotency receipt');
select is((select count(*)::int from private.audit_events where action='DemoAppointmentConfirmed' and correlation_id='76200000-0000-4000-8000-000000000014')+(select count(*)::int from private.outbox_events where event_type='DemoAppointmentConfirmed' and correlation_id='76200000-0000-4000-8000-000000000014'),0,'outbox failure rolls back both audit and outbox effects');

select * from finish();
rollback;
