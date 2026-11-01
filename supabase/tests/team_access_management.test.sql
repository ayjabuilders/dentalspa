begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(26);

insert into public.clinics(id,name) values('b1000000-0000-4000-8000-000000000001','Synthetic Team Access');
insert into auth.users(id,email,raw_app_meta_data) values
 ('b2000000-0000-4000-8000-000000000001','manager@example.test','{}'),
 ('b2000000-0000-4000-8000-000000000002','other-manager@example.test','{}'),
 ('b2000000-0000-4000-8000-000000000003','inactive@example.test','{}');
insert into public.profiles(user_id,display_name) values
 ('b2000000-0000-4000-8000-000000000001','Manager A'),
 ('b2000000-0000-4000-8000-000000000002','Manager B'),
 ('b2000000-0000-4000-8000-000000000003','Inactive Member');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','manager',true),
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','manager',true),
 ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','assistant',false);
update private.local_team_access_settings set enabled=true,api_gate_key='team-local-test' where singleton;
insert into auth.sessions(id,user_id,not_after) values('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',now()+interval '1 hour');
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","session_id":"b3000000-0000-4000-8000-000000000001"}',true);
select set_config('request.method','POST',true);

select ok(not has_table_privilege('authenticated','private.team_access_member_state','SELECT'),'member aggregate is not directly readable');
select ok(not has_table_privilege('anon','private.local_team_provisioning_reservations','SELECT'),'reservation is not exposed to anon');
select ok(not has_function_privilege('anon','public.update_team_access_member(uuid,uuid,integer,text[],boolean,uuid,text,text)','EXECUTE'),'anon cannot execute access command');
set local role authenticated;
select is(jsonb_array_length(public.list_team_access_members('b1000000-0000-4000-8000-000000000001',null,null,'team-local-test')->'items'),3,'manager sees active and inactive clinic members');
select is(public.list_team_access_members('b1000000-0000-4000-8000-000000000001','Manager A',null,'team-local-test')->'items'->0->>'email','manager@example.test','search returns only authorized matching account');
select is(public.list_team_access_members('b1000000-0000-4000-8000-000000000001','%',null,'team-local-test')->'items','[]'::jsonb,'search treats wildcard as literal');
select throws_ok($$select public.list_team_access_members('b1000000-0000-4000-8000-000000000002',null,null,'team-local-test')$$,'42501',null,'foreign clinic denied');
select throws_ok($$select public.list_team_access_members('b1000000-0000-4000-8000-000000000001',null,null,'wrong-gate')$$,'42501',null,'gate required');
reset role;
delete from auth.sessions where id='b3000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.list_team_access_members('b1000000-0000-4000-8000-000000000001',null,null,'team-local-test')$$,'42501',null,'manager session validated against auth.sessions');
reset role;
insert into auth.sessions(id,user_id,not_after) values('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',now()+interval '1 hour');
insert into auth.sessions(id,user_id,not_after) values('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000003',now()+interval '1 hour');
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","session_id":"b3000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select throws_ok($$select public.reserve_local_team_member('b1000000-0000-4000-8000-000000000001','Other@Example.test',repeat('a',64),'New Assistant',array['assistant'],'b4000000-0000-4000-8000-000000000001','team-local-test')$$,'42501',null,'session subject without manager role denied');
reset role;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","session_id":"b3000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select is((public.reserve_local_team_member('b1000000-0000-4000-8000-000000000001','New.User@Example.test',repeat('a',64),'New Assistant',array['assistant'],'b4000000-0000-4000-8000-000000000001','team-local-test')->>'completed')::boolean,false,'manager reserves a new identity before Auth Admin call');
reset role;
select is((select count(*)::int from private.local_team_provisioning_reservations where email_normalized='new.user@example.test'),1,'reservation email is globally unique');
set local role authenticated;
select throws_ok($$select public.reserve_local_team_member('b1000000-0000-4000-8000-000000000001','other@example.test',repeat('a',64),'New Assistant',array['assistant'],'b4000000-0000-4000-8000-000000000001','team-local-test')$$,'23505',null,'same idempotency key cannot change email or payload');
reset role;
insert into auth.users(id,email,raw_app_meta_data) values('b2000000-0000-4000-8000-000000000004','new.user@example.test','{"local_team_provisioning_id":"b9b4a100-0000-4000-8000-000000000001"}');
-- Read the actual reservation UUID for this synthetic account marker.
update auth.users set raw_app_meta_data=jsonb_build_object('local_team_provisioning_id',(select reservation_id::text from private.local_team_provisioning_reservations where email_normalized='new.user@example.test')) where id='b2000000-0000-4000-8000-000000000004';
select set_config('test.team_reservation_id',(select reservation_id::text from private.local_team_provisioning_reservations where email_normalized='new.user@example.test'),true);
set local role authenticated;
select is(public.finalize_local_team_member('b1000000-0000-4000-8000-000000000001',current_setting('test.team_reservation_id')::uuid,'b2000000-0000-4000-8000-000000000004','b4000000-0000-4000-8000-000000000001','team-local-test')->'receipt'->'member'->>'email','new.user@example.test','finalizes only the matching provisioned Auth identity');
select is((public.finalize_local_team_member('b1000000-0000-4000-8000-000000000001',current_setting('test.team_reservation_id')::uuid,'b2000000-0000-4000-8000-000000000004','b4000000-0000-4000-8000-000000000001','team-local-test')->>'replayed')::boolean,true,'finalization retry returns same receipt');
select throws_ok($$select public.finalize_local_team_member('b1000000-0000-4000-8000-000000000001',current_setting('test.team_reservation_id')::uuid,'b2000000-0000-4000-8000-000000000002','b4000000-0000-4000-8000-000000000001','team-local-test')$$,'42501',null,'cannot attach another Auth identity to reservation');
reset role;
select is((select count(*)::int from public.clinic_memberships where user_id='b2000000-0000-4000-8000-000000000004' and active and role='assistant'),1,'new account receives its selected role');
select is((select count(*)::int from private.audit_events where clinic_id='b1000000-0000-4000-8000-000000000001' and action='team.member.created'),1,'account creation writes one audit event');
select is((select count(*)::int from private.outbox_events where clinic_id='b1000000-0000-4000-8000-000000000001' and event_type='TeamMemberCreated'),1,'account creation writes one outbox event');
set local role authenticated;
select is((public.update_team_access_member('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004',1,array['dentist','assistant'],true,'b5000000-0000-4000-8000-000000000001',repeat('b',64),'team-local-test')->'receipt'->'member'->>'version')::int,2,'role change uses versioned compare-and-set');
select is((public.update_team_access_member('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004',1,array['dentist','assistant'],true,'b5000000-0000-4000-8000-000000000001',repeat('b',64),'team-local-test')->>'replayed')::boolean,true,'exact role change replay returns saved receipt');
select throws_ok($$select public.update_team_access_member('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004',1,array['assistant'],true,'b5000000-0000-4000-8000-000000000002',repeat('c',64),'team-local-test')$$,'PT409',null,'stale version rejected');
select throws_ok($$select public.update_team_access_member('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',1,array['assistant'],false,'b5000000-0000-4000-8000-000000000003',repeat('d',64),'team-local-test')$$,'22023',null,'self role or status change rejected');
select throws_ok($$select public.update_team_access_member('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004',2,array['assistant'],false,'b5000000-0000-4000-8000-000000000001',repeat('e',64),'team-local-test')$$,'23505',null,'same update key rejects changed payload');
reset role;
select is((select count(*)::int from private.audit_events where clinic_id='b1000000-0000-4000-8000-000000000001' and action='team.member.access_updated'),1,'successful update writes one audit event');
select is((select count(*)::int from private.outbox_events where clinic_id='b1000000-0000-4000-8000-000000000001' and event_type='TeamMemberAccessUpdated'),1,'successful update writes one outbox event');
select * from finish();
rollback;
