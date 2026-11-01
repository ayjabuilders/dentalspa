begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(24);

insert into public.clinics(id,name) values('b1000000-0000-4000-8000-000000000001','Synthetic profile audit');
insert into auth.users(id) values
 ('b2000000-0000-4000-8000-000000000001'),
 ('b2000000-0000-4000-8000-000000000002');
insert into auth.sessions(id,user_id,not_after) values('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002',now()+interval '1 hour');
insert into public.patients(id,clinic_id,reference,display_name) values
 ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','R-001','Synthetic Alice');
insert into public.patient_account_links(user_id,clinic_id,patient_id,verified_at,verified_by) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',now(),'b2000000-0000-4000-8000-000000000002');

select ok((select prosecdef from pg_proc where oid='public.read_my_patient_profile(uuid,uuid)'::regprocedure),'RPC uses a security definer');
select is((select proconfig from pg_proc where oid='public.read_my_patient_profile(uuid,uuid)'::regprocedure),array['search_path=""'],'RPC pins an empty search path');
select ok(has_function_privilege('authenticated','public.read_my_patient_profile(uuid,uuid)','execute'),'authenticated role can invoke the own-profile RPC');
select ok(not has_function_privilege('anon','public.read_my_patient_profile(uuid,uuid)','execute'),'anonymous role cannot invoke the RPC');
select ok(not has_function_privilege('service_role','public.read_my_patient_profile(uuid,uuid)','execute'),'service role cannot invoke the RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
select is((select id::text from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001')),'b3000000-0000-4000-8000-000000000001','patient reads the linked profile only');
select is((select display_name from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002')),'Synthetic Alice','response contains the minimal own-profile name');
select is((select reference from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000003')),'R-001','response contains the own clinic reference');
reset role;
select is((select count(*)::integer from private.audit_events where action='PatientProfileViewed'),3,'each successful profile read has an audit event');
select is((select count(*)::integer from private.outbox_events where event_type='PatientProfileViewed'),3,'each successful profile read has an outbox event');
select is((select payload from private.outbox_events where correlation_id='b4000000-0000-4000-8000-000000000001'),'{}'::jsonb || jsonb_build_object('access_scope','own_profile'),'outbox payload is limited to access scope');
select ok((select bool_and(payload::text not like '%Synthetic Alice%' and payload::text not like '%R-001%') from private.outbox_events where event_type='PatientProfileViewed'),'outbox payload has no patient name or reference');
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
select is((select count(*)::integer from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000099','b4000000-0000-4000-8000-000000000004')),0,'foreign clinic yields no profile');
reset role;
update public.patient_account_links set verified_at=null,verified_by=null where user_id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
select is((select count(*)::integer from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000005')),0,'unverified patient link yields no profile');
reset role;
select is((select count(*)::integer from private.audit_events where clinic_id='b1000000-0000-4000-8000-000000000001'),3,'denied and empty reads do not create audit events');
select is((select count(*)::integer from private.outbox_events where clinic_id='b1000000-0000-4000-8000-000000000001'),3,'denied and empty reads do not create outbox events');
set local role authenticated;
select throws_ok($$select * from private.audit_events$$,'42501',null,'patient cannot directly read private audit rows');
select set_config('request.method','GET',true);
select throws_ok($$select * from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000007')$$,'22023',null,'GET invocation is denied');
select set_config('request.method','POST',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select throws_ok($$select * from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000008')$$,'28000',null,'missing authenticated subject is denied');
reset role;
set local role anon;
select throws_ok($$select * from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000009')$$,'42501',null,'anonymous direct invocation is denied');
reset role;
set local role service_role;
select throws_ok($$select * from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000010')$$,'42501',null,'service-role direct invocation is denied');
reset role;
update public.patient_account_links
set verified_at=statement_timestamp(),verified_by='b2000000-0000-4000-8000-000000000002'
where user_id='b2000000-0000-4000-8000-000000000001';
create function private.fail_patient_profile_outbox() returns trigger language plpgsql as $$begin raise exception using errcode='P0001',message='synthetic outbox failure';end$$;
create trigger fail_patient_profile_outbox before insert on private.outbox_events for each row execute function private.fail_patient_profile_outbox();
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select throws_ok($$select * from public.read_my_patient_profile('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000011')$$,'P0001',null,'outbox failure aborts the profile read transaction');
reset role;
drop trigger fail_patient_profile_outbox on private.outbox_events;
drop function private.fail_patient_profile_outbox();
select is((select count(*)::integer from private.audit_events where correlation_id='b4000000-0000-4000-8000-000000000011'),0,'outbox failure rolls back its audit row');
select is((select count(*)::integer from private.outbox_events where correlation_id='b4000000-0000-4000-8000-000000000011'),0,'failed outbox transaction leaves no event');

select * from finish();
rollback;
