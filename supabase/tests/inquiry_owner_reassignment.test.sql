begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(27);

insert into public.clinics(id,name) values
 ('a1000000-0000-4000-8000-000000000001','Synthetic owner A'),
 ('a1000000-0000-4000-8000-000000000002','Synthetic owner B');
insert into auth.users(id) values
 ('a2000000-0000-4000-8000-000000000001'), -- active manager
 ('a2000000-0000-4000-8000-000000000002'), -- current reception owner
 ('a2000000-0000-4000-8000-000000000003'), -- active dentist target
 ('a2000000-0000-4000-8000-000000000004'), -- assistant only
 ('a2000000-0000-4000-8000-000000000005'), -- inactive reception
 ('a2000000-0000-4000-8000-000000000006');
-- Live synthetic sessions for authenticated fixture actors.
insert into auth.sessions(id,user_id,not_after) values('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',now()+interval '1 hour'),('a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003',now()+interval '1 hour'),('a2000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000004',now()+interval '1 hour'),('a2000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000005',now()+interval '1 hour'),('a2000000-0000-4000-8000-000000000006','a2000000-0000-4000-8000-000000000006',now()+interval '1 hour'); -- foreign clinic
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','manager',true),
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','reception',true),
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','dentist',true),
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000004','assistant',true),
 ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000005','reception',false),
 ('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000006','manager',true);
insert into public.inquiries(id,clinic_id,owner_user_id,display_name,contact_email,contact_phone,source) values
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','Synthetic intake','secret@example.test','+212600000000','phone'),
 ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000006','Foreign intake',null,null,'website');

select ok(has_function_privilege('authenticated','public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE'),'authenticated may invoke manager-gated RPC');
select ok(not has_function_privilege('anon','public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE'),'anonymous execution denied');
select ok(not has_function_privilege('service_role','public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE'),'service-role execution denied');
select ok((select 'search_path=""'=any(proconfig) and array_to_string(proconfig,',') ilike '%timezone=UTC%' from pg_proc where oid='public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure),'definer pins empty search path and UTC');
select is((select enabled from private.intake_command_settings where singleton),false,'command setting defaults off');
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method','POST',true);
set local role authenticated;
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001')$$,'PT503',null,'database gate enforced while disabled');
reset role;
update private.intake_command_settings set enabled=true where singleton;
set local role authenticated;
select is(public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001')->>'replayed','false','manager assignment commits');
select is((select owner_user_id::text from public.inquiries where id='a3000000-0000-4000-8000-000000000001'),'a2000000-0000-4000-8000-000000000003','selected owner is stored');
reset role;
select is((select count(*)::integer from private.audit_events where action='InquiryOwnerReassigned'),1,'change emits one audit event');
select is((select count(*)::integer from private.outbox_events where event_type='InquiryOwnerReassigned'),1,'change emits one outbox event');
select is((select payload from private.outbox_events where event_type='InquiryOwnerReassigned'),'{}'::jsonb || jsonb_build_object('inquiry_id','a3000000-0000-4000-8000-000000000001','previous_owner_user_id','a2000000-0000-4000-8000-000000000002','owner_user_id','a2000000-0000-4000-8000-000000000003'),'event excludes contact details');
set local role authenticated;
select is(public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002')->>'replayed','true','same request key returns original receipt');
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002')$$,'PT409',null,'same key with changed body conflicts');
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000002')$$,'PT409',null,'stale observed owner conflicts');
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000006','a2000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-000000000002')$$,'PT404',null,'foreign inquiry hidden');
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000005','a5000000-0000-4000-8000-000000000001')$$,'42501',null,'non-manager actor denied');
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000006','a5000000-0000-4000-8000-000000000001')$$,'42501',null,'assistant-only target denied');
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000005','a4000000-0000-4000-8000-000000000007','a5000000-0000-4000-8000-000000000001')$$,'42501',null,'inactive target denied');
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-000000000008','a5000000-0000-4000-8000-000000000001')$$,'42501',null,'cross-clinic target denied');
select is(public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000009','a5000000-0000-4000-8000-000000000003')->'receipt'->>'changed','false','same owner returns a no-op receipt');
reset role;
select is((select count(*)::integer from private.audit_events where action='InquiryOwnerReassigned'),1,'no-op emits no second audit');
select set_config('request.method','GET',true);
set local role authenticated;
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000010','a5000000-0000-4000-8000-000000000004')$$,'22023',null,'non-POST call denied');
reset role;
set local role anon;
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000011','a5000000-0000-4000-8000-000000000005')$$,'42501',null,'anonymous invocation denied');
reset role;
set local role service_role;
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000012','a5000000-0000-4000-8000-000000000006')$$,'42501',null,'service-role invocation denied');
reset role;
select set_config('request.method','POST',true);
create function private.fail_owner_reassignment_test() returns trigger language plpgsql as $$begin raise exception using errcode='P0001',message='synthetic outbox failure';end$$;
create trigger fail_owner_reassignment_test before insert on private.outbox_events for each row execute function private.fail_owner_reassignment_test();
set local role authenticated;
select throws_ok($$select public.reassign_inquiry_owner('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000013','a5000000-0000-4000-8000-000000000007')$$,'P0001','synthetic outbox failure','sink failure aborts assignment');
reset role;
drop trigger fail_owner_reassignment_test on private.outbox_events;
drop function private.fail_owner_reassignment_test();
select is((select owner_user_id::text from public.inquiries where id='a3000000-0000-4000-8000-000000000001'),'a2000000-0000-4000-8000-000000000003','outbox failure preserves current owner');
select is((select count(*)::integer from private.audit_events where action='InquiryOwnerReassigned'),1,'outbox failure rolls back its audit event');

select * from finish();
rollback;
