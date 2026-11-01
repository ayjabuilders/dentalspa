begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

insert into public.clinics(id, name) values
  ('91000000-0000-4000-8000-000000000001', 'Synthetic checklist A'),
  ('91000000-0000-4000-8000-000000000002', 'Synthetic checklist B');
insert into auth.users(id) values
  ('92000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002'),
  ('92000000-0000-4000-8000-000000000003');
insert into auth.sessions(id,user_id,not_after) values('92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('92000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002',now()+interval '1 hour'),('92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000003',now()+interval '1 hour');
insert into public.patients(id, clinic_id, reference, display_name) values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'SYN-1', 'Synthetic Samira'),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'SYN-2', 'Synthetic Foreign');
insert into public.clinic_memberships(clinic_id, user_id, role, active) values
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'reception', true),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', 'assistant', true),
  ('91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000003', 'manager', true);

select is((select enabled from private.patient_admin_document_checklist_settings where singleton), false, 'feature defaults off');
select ok(not has_table_privilege('authenticated', 'private.patient_admin_document_checklist', 'SELECT'), 'authenticated cannot read private state directly');
select ok(not has_table_privilege('authenticated', 'private.patient_admin_document_checklist', 'INSERT'), 'authenticated cannot write private state directly');
select ok(not has_function_privilege('anon', 'public.list_patient_admin_document_checklist(uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot execute list RPC');
select ok(not has_function_privilege('anon', 'public.set_patient_admin_document_checklist(uuid,uuid,jsonb,uuid,uuid)', 'EXECUTE'), 'anon cannot execute write RPC');
select ok(has_function_privilege('authenticated', 'public.set_patient_admin_document_checklist(uuid,uuid,jsonb,uuid,uuid)', 'EXECUTE'), 'authenticated can execute write RPC');
select ok(not has_function_privilege('service_role', 'public.set_patient_admin_document_checklist(uuid,uuid,jsonb,uuid,uuid)', 'EXECUTE'), 'service role has no RPC shortcut');
select ok((select prosecdef from pg_proc where oid='public.list_patient_admin_document_checklist(uuid,uuid,uuid)'::regprocedure), 'list RPC runs as its restricted owner');
select ok((select prosecdef from pg_proc where oid='public.set_patient_admin_document_checklist(uuid,uuid,jsonb,uuid,uuid)'::regprocedure), 'write RPC runs as its restricted owner');

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
select set_config('request.method', 'POST', true);
set local role authenticated;
select throws_ok($$select public.list_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001')$$, 'PT503', null, 'list is disabled by default');
select throws_ok($$select public.set_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','{"expected_revision":0,"kind":"cnss","status":"received"}','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001')$$, 'PT503', null, 'write is disabled by default');
reset role;

update private.patient_admin_document_checklist_settings set enabled=true where singleton;
set local role authenticated;
select is(public.list_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001')->'items', '[]'::jsonb, 'new patient has no inferred checklist status');
select is(public.set_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','{"expected_revision":0,"kind":"cnss","status":"received"}','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001')->>'replayed', 'false', 'permitted same-clinic receptionist records one status');
reset role;
select is((select status from private.patient_admin_document_checklist where patient_id='93000000-0000-4000-8000-000000000001' and kind='cnss'), 'received', 'database stores only the selected administrative status');
select is((select updated_by from private.patient_admin_document_checklist where patient_id='93000000-0000-4000-8000-000000000001' and kind='cnss'), '92000000-0000-4000-8000-000000000001'::uuid, 'database records the verified actor');
select is((select count(*)::integer from private.audit_events where action='PatientAdminDocumentChecklistChanged'), 1, 'status change emits an audit event');
select is((select payload from private.outbox_events where event_type='PatientAdminDocumentChecklistChanged'), '{"kind":"cnss","status":"received","revision":1}'::jsonb, 'outbox contains bounded administrative values only');
set local role authenticated;
select is(public.set_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','{"expected_revision":0,"kind":"cnss","status":"received"}','95000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001')->>'replayed', 'true', 'exact idempotent replay returns stored receipt');
select throws_ok($$select public.set_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','{"expected_revision":0,"kind":"cnss","status":"missing"}','95000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000001')$$, 'PT409', null, 'stale revision cannot overwrite a newer status');
select throws_ok($$select public.list_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000001')$$, 'PT404', null, 'foreign-clinic patient is concealed');
select throws_ok($$select * from private.patient_admin_document_checklist$$, '42501', null, 'authenticated cannot select private checklist');
reset role;

update public.clinic_memberships set role='assistant' where user_id='92000000-0000-4000-8000-000000000001' and clinic_id='91000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.list_patient_admin_document_checklist('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001')$$, '42501', null, 'assistant has no checklist access');
reset role;

select * from finish();
rollback;
