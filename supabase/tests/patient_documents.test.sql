begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(38);

insert into public.clinics(id,name) values
 ('91000000-0000-4000-8000-000000000001','Synthetic Cabinet A'),
 ('91000000-0000-4000-8000-000000000002','Synthetic Cabinet B');
insert into auth.users(id) values
 ('92000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002'),
 ('92000000-0000-4000-8000-000000000003'),
 ('92000000-0000-4000-8000-000000000004'),
 ('92000000-0000-4000-8000-000000000005');
insert into auth.sessions(id,user_id,not_after) values
 ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',now()+interval '1 hour'),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002',now()+interval '1 hour'),
 ('94000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000003',now()+interval '1 hour'),
 ('94000000-0000-4000-8000-000000000004','92000000-0000-4000-8000-000000000004',now()+interval '1 hour'),
 ('94000000-0000-4000-8000-000000000005','92000000-0000-4000-8000-000000000005',now()+interval '1 hour');
insert into public.profiles(user_id,display_name) values
 ('92000000-0000-4000-8000-000000000001','Dr Salma Synthetic'),
 ('92000000-0000-4000-8000-000000000002','Synthetic Assistant');
insert into public.patients(id,clinic_id,reference,display_name) values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','SYN-A-1','Synthetic Salma'),
 ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','SYN-B-1','Synthetic Foreign');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','dentist',true),
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','assistant',true),
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000003','manager',true),
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000004','reception',true),
 ('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000005','manager',true);
select private.seed_patient_document_templates('91000000-0000-4000-8000-000000000001');
select private.seed_patient_document_templates('91000000-0000-4000-8000-000000000002');
select set_config('test.report_template',(select id::text from private.patient_document_templates where clinic_id='91000000-0000-4000-8000-000000000001' and document_type='report' and version=1),true);
select set_config('test.prescription_template',(select id::text from private.patient_document_templates where clinic_id='91000000-0000-4000-8000-000000000001' and document_type='prescription' and version=1),true);

select is((select enabled from private.patient_documents_settings where singleton),false,'documents default off');
select ok(not has_table_privilege('authenticated','private.patient_document_uploads','SELECT'),'authenticated cannot read private metadata directly');
select ok(not has_table_privilege('authenticated','private.patient_document_drafts','INSERT'),'authenticated cannot write private drafts directly');
select ok(not has_function_privilege('anon','public.list_patient_documents(uuid,uuid,text,text,text,integer,text)','EXECUTE'),'anon cannot list documents');
select ok(has_function_privilege('authenticated','public.list_patient_documents(uuid,uuid,text,text,text,integer,text)','EXECUTE'),'authenticated can call scoped list RPC');
select ok(not has_function_privilege('service_role','public.register_patient_document_upload(uuid,uuid,uuid,text,text,text,date,text,integer,text,text,uuid,uuid,text)','EXECUTE'),'service role cannot bypass document command authorization');
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000004","session_id":"94000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.list_patient_documents('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','administrative',null,null,10,'synthetic-gate')$$,'PT503',null,'feature gate blocks the endpoint by default');
reset role;
update private.patient_documents_settings set enabled=true,api_gate_key='synthetic-gate' where singleton;

set local role authenticated;
select is(public.list_patient_documents('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','administrative',null,null,10,'synthetic-gate')->'items','[]'::jsonb,'reception can read administrative documents');
select throws_ok($$select public.list_patient_documents('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','clinical',null,null,10,'synthetic-gate')$$,'42501',null,'reception cannot read clinical records');
select throws_ok($$select public.list_patient_documents('91000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','administrative',null,null,10,'synthetic-gate')$$,'42501',null,'another clinic member cannot cross tenant scope');
select throws_ok($$select public.list_patient_documents('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','administrative',null,null,10,'synthetic-gate')$$,'PT404',null,'same clinic role cannot request another tenant patient id');
reset role;

select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000003","session_id":"94000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is(public.list_patient_documents('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','clinical',null,null,10,'synthetic-gate')->'items','[]'::jsonb,'manager can list clinical imports without seeing clinical drafts');
select is(public.register_patient_document_upload('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000010','clinical','radiograph','Synthetic radiograph','2026-11-01','application/pdf',14,repeat('c',64),'91000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/clinical/96000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000011','98000000-0000-4000-8000-000000000012','synthetic-gate')->>'replayed','false','manager can import a clinical file');
select is(public.read_patient_document_content('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000010','synthetic-gate')->>'kind','upload','manager can read imported clinical file content through the proxy metadata');
select throws_ok($$select public.read_patient_document_templates('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','report','synthetic-gate')$$,'42501',null,'manager cannot read clinical templates');
select throws_ok($$select public.create_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',jsonb_build_object('type','report','template_id',current_setting('test.report_template')::uuid,'template_version',1,'title','Synthetic report','document_date','2026-11-01','content',jsonb_build_object('body','')),'97000000-0000-4000-8000-000000000013','98000000-0000-4000-8000-000000000013','synthetic-gate')$$,'42501',null,'manager cannot author clinical drafts');
reset role;

select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","session_id":"94000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.list_patient_documents('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','administrative',null,null,10,'synthetic-gate')->'items'),0,'assistant can read empty administrative documents before first import');
select is(jsonb_array_length(public.list_patient_document_library('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',null,null,null,'synthetic-gate','clinical')->'items'),1,'assistant can read clinical records including manager imports');
select is(public.register_patient_document_upload('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001','administrative','identity','Synthetic identity','2026-11-01','application/pdf',14,repeat('a',64),'91000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/administrative/96000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','synthetic-gate')->>'replayed','false','assistant can import a scoped administrative file');
select is(public.register_patient_document_upload('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','administrative','identity','Synthetic identity','2026-11-01','application/pdf',14,repeat('a',64),'91000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/administrative/96000000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002','synthetic-gate')->>'replayed','true','same upload retries return the original metadata receipt');
select throws_ok($$select public.register_patient_document_upload('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','administrative','identity','Synthetic identity','2026-11-01','application/pdf',14,repeat('b',64),'91000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/administrative/96000000-0000-4000-8000-000000000003','97000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000003','synthetic-gate')$$,'PT409',null,'same idempotency key with different bytes conflicts');
reset role;
select is((select count(*)::integer from private.patient_document_uploads where clinic_id='91000000-0000-4000-8000-000000000001'),2,'conflicting replay did not overwrite either imported upload');
select is((select count(*)::integer from private.audit_events where action='patient_document.uploaded'),2,'each upload metadata write emits one audit event');
select is((select count(*)::integer from private.outbox_events where event_type='PatientDocumentUploaded'),2,'each upload metadata write emits one outbox event');
set local role authenticated;
select throws_ok($$select public.read_patient_document_templates('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','prescription','synthetic-gate')$$,'42501',null,'assistant cannot inspect prescription templates');
select throws_ok($$select public.create_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',jsonb_build_object('type','prescription','template_id',current_setting('test.prescription_template')::uuid,'template_version',1,'title','Blank','document_date','2026-11-01','content',jsonb_build_object('body','')),'97000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000004','synthetic-gate')$$,'42501',null,'assistant cannot create prescription content');
select is(public.create_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',jsonb_build_object('type','report','template_id',current_setting('test.report_template')::uuid,'template_version',1,'title','Synthetic report','document_date','2026-11-01','content',jsonb_build_object('body','')),'97000000-0000-4000-8000-000000000005','98000000-0000-4000-8000-000000000005','synthetic-gate')->'draft'->>'version','1','assistant can create a blank report draft');
select set_config('test.report_draft',(public.create_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',jsonb_build_object('type','report','template_id',current_setting('test.report_template')::uuid,'template_version',1,'title','Synthetic report','document_date','2026-11-01','content',jsonb_build_object('body','')),'97000000-0000-4000-8000-000000000005','98000000-0000-4000-8000-000000000005','synthetic-gate')->'draft'->>'id'),true);
select is(public.update_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',current_setting('test.report_draft')::uuid,'{"expected_version":1,"title":"Synthetic report","document_date":"2026-11-01","content":{"body":"Synthetic text only"}}','97000000-0000-4000-8000-000000000006','98000000-0000-4000-8000-000000000006','synthetic-gate')->'draft'->>'version','2','assistant can edit report draft');
select throws_ok($$select public.validate_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',current_setting('test.report_draft')::uuid,2,'97000000-0000-4000-8000-000000000007','98000000-0000-4000-8000-000000000007','synthetic-gate')$$,'42501',null,'assistant cannot validate clinical content');
reset role;

select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","session_id":"94000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.validate_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',current_setting('test.report_draft')::uuid,2,'97000000-0000-4000-8000-000000000008','98000000-0000-4000-8000-000000000008','synthetic-gate')->'item'->>'status','validated','dentist validates one immutable report version');
select is(public.validate_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',current_setting('test.report_draft')::uuid,2,'97000000-0000-4000-8000-000000000008','98000000-0000-4000-8000-000000000009','synthetic-gate')->>'replayed','true','exact validation retry succeeds after draft transitions to validated');
reset role;
select set_config('test.report_version',(select id::text from private.patient_document_versions where draft_id=current_setting('test.report_draft')::uuid),true);
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","session_id":"94000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.update_patient_document_draft('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',current_setting('test.report_draft')::uuid,'{"expected_version":1,"title":"Synthetic report","document_date":"2026-11-01","content":{"body":"Synthetic text only"}}','97000000-0000-4000-8000-000000000006','98000000-0000-4000-8000-000000000010','synthetic-gate')->>'replayed','true','exact update retry succeeds after later validation');
select is(public.list_patient_document_draft_versions('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',current_setting('test.report_draft')::uuid,'synthetic-gate')->'items'->0->>'version','2','immutable draft history returns updated revision');
reset role;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000003","session_id":"94000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.list_patient_document_library('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',null,null,null,'synthetic-gate','clinical')->'items'),1,'manager medical list excludes dentist-validated generated reports');
select is(public.list_patient_documents('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','clinical',null,null,10,'synthetic-gate')->'items','[]'::jsonb,'manager generated-record list excludes clinician reports and catalog imports');
select throws_ok($$select public.read_patient_document_content('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',current_setting('test.report_version')::uuid,'synthetic-gate')$$,'42501',null,'manager cannot read generated clinical content');
reset role;
select ok((select not has_table_privilege('authenticated','private.patient_document_command_receipts','SELECT')),'command receipts stay private');
select ok(not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and (coalesce(qual,'') ilike '%patient-documents%' or coalesce(with_check,'') ilike '%patient-documents%')),'no direct Storage policy grants patient documents');

select * from finish();
rollback;
