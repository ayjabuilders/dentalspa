begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(41);

insert into public.clinics(id,name) values
  ('a1000000-0000-4000-8000-000000000001','Synthetic preferences A'),
  ('a1000000-0000-4000-8000-000000000002','Synthetic preferences B');
insert into auth.users(id) values
  ('a2000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002'),
  ('a2000000-0000-4000-8000-000000000003');
insert into auth.sessions(id,user_id,not_after) values('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',now()+interval '1 hour'),('a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003',now()+interval '1 hour');
insert into public.patients(id,clinic_id,reference,display_name) values
  ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','SYN-PREF-001','Synthetic Patient A'),
  ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','SYN-PREF-002','Synthetic Patient B'),
  ('a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','SYN-PREF-003','Synthetic Patient C');
insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by) values
  ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',clock_timestamp(),'a2000000-0000-4000-8000-000000000002'),
  ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003',null,null);

select is((select enabled from private.patient_communication_settings where singleton),false,'patient preference database gate defaults off');
select ok(not has_table_privilege('authenticated','private.patient_communication_preferences','SELECT'),'authenticated cannot directly read private preferences');
select ok(not has_table_privilege('authenticated','private.patient_communication_preferences','INSERT'),'authenticated cannot directly write private preferences');
select ok(not has_function_privilege('anon','public.get_my_patient_communication_preferences(uuid,uuid)','EXECUTE'),'anonymous cannot read preferences');
select ok(not has_function_privilege('anon','public.set_my_patient_communication_preferences(uuid,jsonb,uuid,uuid)','EXECUTE'),'anonymous cannot write preferences');
select ok(has_function_privilege('authenticated','public.get_my_patient_communication_preferences(uuid,uuid)','EXECUTE'),'authenticated may call own read RPC');
select ok(has_function_privilege('authenticated','public.set_my_patient_communication_preferences(uuid,jsonb,uuid,uuid)','EXECUTE'),'authenticated may call own write RPC');
select ok(not has_function_privilege('service_role','public.get_my_patient_communication_preferences(uuid,uuid)','EXECUTE'),'service role cannot shortcut own read RPC');
select ok(not has_function_privilege('service_role','public.set_my_patient_communication_preferences(uuid,jsonb,uuid,uuid)','EXECUTE'),'service role cannot shortcut own write RPC');
select ok((select prosecdef from pg_proc where oid='public.get_my_patient_communication_preferences(uuid,uuid)'::regprocedure),'read RPC uses its restricted owner');
select ok((select prosecdef from pg_proc where oid='public.set_my_patient_communication_preferences(uuid,jsonb,uuid,uuid)'::regprocedure),'write RPC uses its restricted owner');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.get_my_patient_communication_preferences(uuid,uuid)'::regprocedure),'read RPC pins an empty search path');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.set_my_patient_communication_preferences(uuid,jsonb,uuid,uuid)'::regprocedure),'write RPC pins an empty search path');

select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
set local role authenticated;
select is(public.get_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001'),
  jsonb_build_object('schema_version',1,'clinic_id','a1000000-0000-4000-8000-000000000001'::uuid,'patient_id','a3000000-0000-4000-8000-000000000001'::uuid,'contact_preference',null,'language',null,'time_zone',null,'revision',0,'updated_at',null),
  'verified patient reads only their empty preference state');
reset role;
select is((select count(*)::integer from private.audit_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and action='PatientCommunicationPreferencesViewed'),1,'own read emits one fixture-scoped audit event');
select is((select payload from private.outbox_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and event_type='PatientCommunicationPreferencesViewed'),'{"access_scope":"own_preferences"}'::jsonb,'read outbox contains no preference or contact values');

set local role authenticated;
select throws_ok($$select public.get_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000002')$$,'42501',null,'foreign clinic is denied without revealing a patient');
reset role;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
set local role authenticated;
select throws_ok($$select public.get_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000003')$$,'42501',null,'unverified patient link is denied');
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select throws_ok($$select public.get_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000004')$$,'28000',null,'anonymous identity is denied');
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','GET',true);
select throws_ok($$select public.get_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000005')$$,'22023',null,'read RPC is POST only');
reset role;
select is((select count(*)::integer from private.audit_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and action='PatientCommunicationPreferencesViewed'),1,'denied reads add no audit event');
select is((select count(*)::integer from private.outbox_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and event_type='PatientCommunicationPreferencesViewed'),1,'denied reads add no outbox event');

select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
set local role authenticated;
select throws_ok($$select public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":0,"contact_preference":"phone","language":"fr","time_zone":"Africa/Casablanca"}','a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000006')$$,'PT503',null,'write RPC stays disabled by default');
select throws_ok($$select * from private.patient_communication_preferences$$,'42501',null,'authenticated cannot directly read private preference rows');
select throws_ok($$insert into private.patient_communication_preferences(clinic_id,patient_id,revision) values('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',0)$$,'42501',null,'authenticated cannot directly insert private preference rows');
reset role;
update private.patient_communication_settings set enabled=true where singleton;
set local role authenticated;
select throws_ok($$select public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":0,"contact_preference":"phone","language":"fr","time_zone":"Africa/Casablanca","extra":"not allowed"}','a5000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000007')$$,'22023',null,'unknown write fields are rejected');
select throws_ok($$select public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":0,"contact_preference":"phone","language":"fr","time_zone":"Europe/Madrid"}','a5000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000008')$$,'22023',null,'unknown time zones are rejected');
select is(public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":0,"contact_preference":"phone","language":"fr","time_zone":"Africa/Casablanca"}','a5000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000009')->'receipt'->>'revision','1','valid update advances one revision');
select is(public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":1,"contact_preference":"phone","language":"fr","time_zone":"Africa/Casablanca"}','a5000000-0000-4000-8000-000000000005','a4000000-0000-4000-8000-000000000010')->'receipt'->>'changed','false','unchanged values create a no-op receipt');
reset role;
select is((select jsonb_build_object('contact_preference',contact_preference,'language',language,'time_zone',time_zone,'revision',revision) from private.patient_communication_preferences where clinic_id='a1000000-0000-4000-8000-000000000001' and patient_id='a3000000-0000-4000-8000-000000000001'),'{"contact_preference":"phone","language":"fr","time_zone":"Africa/Casablanca","revision":1}'::jsonb,'database stores the explicit patient-stated values');
select is((select count(*)::integer from private.audit_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and action='PatientCommunicationPreferencesChanged'),1,'changed fields produce one audit event');
select is((select payload from private.outbox_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and event_type='PatientCommunicationPreferencesChanged'),'{"revision":1,"changed_field_count":3}'::jsonb,'change outbox omits contact, language and time-zone values');
set local role authenticated;
select is(public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":0,"contact_preference":"phone","language":"fr","time_zone":"Africa/Casablanca"}','a5000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000011')->>'replayed','true','identical request key returns its original receipt');
select throws_ok($$select public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":0,"contact_preference":"email","language":"fr","time_zone":"Africa/Casablanca"}','a5000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000012')$$,'PT409',null,'same idempotency key with changed payload conflicts');
select throws_ok($$select public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":0,"contact_preference":"email","language":"fr","time_zone":"Africa/Casablanca"}','a5000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-000000000013')$$,'PT409',null,'stale expected revision conflicts');
reset role;
select is((select count(*)::integer from private.audit_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and action='PatientCommunicationPreferencesChanged'),1,'no-op, replay and conflicts do not add change audit events');

create function private.fail_patient_preferences_outbox_test() returns trigger language plpgsql as $$begin raise exception using errcode='P0001',message='synthetic sink failure';end$$;
create trigger fail_patient_preferences_outbox_test before insert on private.outbox_events for each row when (new.event_type='PatientCommunicationPreferencesChanged') execute function private.fail_patient_preferences_outbox_test();
set local role authenticated;
select throws_ok($$select public.set_my_patient_communication_preferences('a1000000-0000-4000-8000-000000000001','{"expected_revision":1,"contact_preference":"email","language":"fr","time_zone":"Africa/Casablanca"}','a5000000-0000-4000-8000-000000000007','a4000000-0000-4000-8000-000000000014')$$,'P0001','synthetic sink failure','outbox failure rolls back the full update');
reset role;
select is((select jsonb_build_object('contact_preference',contact_preference,'revision',revision) from private.patient_communication_preferences where clinic_id='a1000000-0000-4000-8000-000000000001' and patient_id='a3000000-0000-4000-8000-000000000001'),'{"contact_preference":"phone","revision":1}'::jsonb,'failed outbox write leaves state unchanged');
select is((select count(*)::integer from private.patient_communication_preference_receipts where clinic_id='a1000000-0000-4000-8000-000000000001' and patient_id='a3000000-0000-4000-8000-000000000001' and request_key='a5000000-0000-4000-8000-000000000007'),0,'failed outbox write leaves no receipt');
select is((select count(*)::integer from private.audit_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and action='PatientCommunicationPreferencesChanged'),1,'failed command emits no partial audit event');
select is((select count(*)::integer from private.outbox_events where clinic_id='a1000000-0000-4000-8000-000000000001' and aggregate_id='a3000000-0000-4000-8000-000000000001' and event_type='PatientCommunicationPreferencesChanged'),1,'failed command emits no partial outbox event');
drop trigger fail_patient_preferences_outbox_test on private.outbox_events;
drop function private.fail_patient_preferences_outbox_test();
select * from finish();
rollback;
