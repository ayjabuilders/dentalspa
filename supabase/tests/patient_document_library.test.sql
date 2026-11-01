begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(33);

insert into public.clinics(id,name) values('a9100000-0000-4000-8000-000000000001','Synthetic Library A'),('a9100000-0000-4000-8000-000000000002','Synthetic Library B');
insert into auth.users(id) values
 ('a9200000-0000-4000-8000-000000000001'),('a9200000-0000-4000-8000-000000000002'),
 ('a9200000-0000-4000-8000-000000000003'),('a9200000-0000-4000-8000-000000000004'),
 ('a9200000-0000-4000-8000-000000000005');
insert into auth.sessions(id,user_id,not_after) values
 ('a9400000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000001',now()+interval '1 hour'),
 ('a9400000-0000-4000-8000-000000000002','a9200000-0000-4000-8000-000000000002',now()+interval '1 hour'),
 ('a9400000-0000-4000-8000-000000000003','a9200000-0000-4000-8000-000000000003',now()+interval '1 hour'),
 ('a9400000-0000-4000-8000-000000000004','a9200000-0000-4000-8000-000000000004',now()+interval '1 hour'),
 ('a9400000-0000-4000-8000-000000000005','a9200000-0000-4000-8000-000000000005',now()+interval '1 hour');
insert into public.profiles(user_id,display_name) values
 ('a9200000-0000-4000-8000-000000000001','Manager Salma'),('a9200000-0000-4000-8000-000000000002','Assistant Yassine'),
 ('a9200000-0000-4000-8000-000000000003','Reception Imane'),('a9200000-0000-4000-8000-000000000004','Dentist Hamza'),
 ('a9200000-0000-4000-8000-000000000005','Foreign Manager');
insert into public.patients(id,clinic_id,reference,display_name) values
 ('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','LIB-A-1','Synthetic Salma'),
 ('a9300000-0000-4000-8000-000000000002','a9100000-0000-4000-8000-000000000002','LIB-B-1','Synthetic Foreign');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('a9100000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000001','manager',true),
 ('a9100000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000002','assistant',true),
 ('a9100000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000003','reception',true),
 ('a9100000-0000-4000-8000-000000000001','a9200000-0000-4000-8000-000000000004','dentist',true),
 ('a9100000-0000-4000-8000-000000000002','a9200000-0000-4000-8000-000000000005','manager',true);
update private.patient_documents_settings set enabled=true,api_gate_key='library-test-gate' where singleton;
select set_config('request.method','POST',true);
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a9200000-0000-4000-8000-000000000001","session_id":"a9400000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select ok(not has_table_privilege('authenticated','private.patient_document_library_catalog','SELECT'),'catalog is not directly readable');
select ok(not has_function_privilege('anon','public.list_patient_document_library(uuid,uuid,text,text,text,text,text)','EXECUTE'),'anon cannot list patient library');
select ok(has_function_privilege('authenticated','public.register_patient_document_library_upload(uuid,uuid,uuid,text,text,text,date,text,uuid,text,text,integer,text,text,uuid,uuid,text)','EXECUTE'),'authenticated can call the scoped upload command');
set local role authenticated;
select is(jsonb_array_length(public.read_patient_document_library_options('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','library-test-gate')->'categories'),14,'manager receives current category catalog');
select is(public.read_patient_document_library_options('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','library-test-gate')->'appointments','[]'::jsonb,'no appointment options are invented');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate')->'items','[]'::jsonb,'new patient library starts empty');
select throws_ok($$select public.list_patient_document_library('a9100000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000002',null,null,null,'library-test-gate')$$,'42501',null,'foreign clinic member cannot list another tenant');
select throws_ok($$select public.register_patient_document_library_upload('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','a9600000-0000-4000-8000-000000000001','imaging','legacy_unspecified','',null,'','a9500000-0000-4000-8000-000000000001','scan.pdf','application/pdf',12,repeat('a',64),'a9100000-0000-4000-8000-000000000001/a9300000-0000-4000-8000-000000000001/clinical/a9600000-0000-4000-8000-000000000001','a9700000-0000-4000-8000-000000000001','a9800000-0000-4000-8000-000000000001','library-test-gate')$$,'PT404',null,'foreign or nonexistent appointment cannot be attached');
select set_config('test.library_upload',(public.register_patient_document_library_upload('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','a9600000-0000-4000-8000-000000000001','imaging','legacy_unspecified','',null,'',null,'scan.pdf','application/pdf',12,repeat('a',64),'a9100000-0000-4000-8000-000000000001/a9300000-0000-4000-8000-000000000001/clinical/a9600000-0000-4000-8000-000000000001','a9700000-0000-4000-8000-000000000001','a9800000-0000-4000-8000-000000000001','library-test-gate')->'item'->>'id'),true);
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,'scan',null,'library-test-gate')->'items'->0->>'title','scan.pdf','empty title falls back to original file name');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate','clinical')->'items'->0->>'title','scan.pdf','clinical tab filters the server result before pagination');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate','administrative')->'items','[]'::jsonb,'administrative tab excludes clinical files on the server');
select throws_ok($$select public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','imaging',null,null,'library-test-gate','administrative')$$,'22023',null,'category cannot be requested in a different section');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,'%',null,'library-test-gate')->'items','[]'::jsonb,'search wildcard characters are literal');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate')->'items'->0->>'document_date',null,'nullable document date is preserved');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate')->'items'->0->>'uploaded_by','Manager Salma','library does not expose actor UUID as the visible uploader label');
select is(public.read_patient_document_content('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,'library-test-gate')->>'kind','upload','library uploads remain available only through the authenticated proxy');
select is(public.update_patient_document_library_metadata('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,1,'reports','legacy_unspecified','', '2026-10-21','Synthetic note',null,'a9700000-0000-4000-8000-000000000002','a9800000-0000-4000-8000-000000000002','library-test-gate')->'item'->>'version','2','manager can edit file metadata with CAS');
select is((public.update_patient_document_library_metadata('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,1,'reports','legacy_unspecified','','2026-10-21','Synthetic note',null,'a9700000-0000-4000-8000-000000000002','a9800000-0000-4000-8000-000000000003','library-test-gate')->>'replayed')::boolean,true,'exact metadata update retry replays saved receipt');
select throws_ok($$select public.update_patient_document_library_metadata('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,1,'reports','legacy_unspecified','','2026-10-21','changed',null,'a9700000-0000-4000-8000-000000000004','a9800000-0000-4000-8000-000000000004','library-test-gate')$$,'PT409',null,'stale metadata version is rejected');
reset role;
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a9200000-0000-4000-8000-000000000002","session_id":"a9400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate')->'items'->0->>'can_edit')::boolean,false,'assistant sees but cannot edit a manager-owned file');
select throws_ok($$select public.update_patient_document_library_metadata('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,2,'reports','legacy_unspecified','Changed','2026-10-21','',null,'a9700000-0000-4000-8000-000000000009','a9800000-0000-4000-8000-000000000009','library-test-gate')$$,'42501',null,'assistant cannot edit another uploader active file');
reset role;
select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a9200000-0000-4000-8000-000000000001","session_id":"a9400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((public.archive_patient_document_library_item('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,2,'a9700000-0000-4000-8000-000000000005','a9800000-0000-4000-8000-000000000005','library-test-gate')->>'deleted')::boolean,true,'manager archives with a versioned command');
select is((public.archive_patient_document_library_item('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,2,'a9700000-0000-4000-8000-000000000005','a9800000-0000-4000-8000-000000000006','library-test-gate')->>'replayed')::boolean,true,'exact archive retry is idempotent');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate')->'items','[]'::jsonb,'archived files are omitted from the library');
select throws_ok($$select public.read_patient_document_content('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',current_setting('test.library_upload')::uuid,'library-test-gate')$$,'42501',null,'existing content proxy denies archived upload bytes');
reset role;
select is((select count(*)::int from private.patient_document_uploads where id=current_setting('test.library_upload')::uuid and deleted_at is not null),1,'archive preserves file metadata as a soft-delete row');
select is((select count(*)::int from private.audit_events where action in('patient_document.library_uploaded','patient_document.library_metadata_updated','patient_document.library_archived')),3,'upload edit and archive each write audit events');
select is((select count(*)::int from private.outbox_events where event_type in('PatientDocumentLibraryUploaded','PatientDocumentLibraryMetadataUpdated','PatientDocumentLibraryArchived')),3,'upload edit and archive each write outbox events');

select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a9200000-0000-4000-8000-000000000002","session_id":"a9400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.register_patient_document_library_upload('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','a9600000-0000-4000-8000-000000000002','other','other','Assistant own file',null,'',null,'assistant.pdf','application/pdf',12,repeat('b',64),'a9100000-0000-4000-8000-000000000001/a9300000-0000-4000-8000-000000000001/clinical/a9600000-0000-4000-8000-000000000002','a9700000-0000-4000-8000-000000000007','a9800000-0000-4000-8000-000000000007','library-test-gate')->'item'->>'can_edit','true','assistant may manage own uploaded file');
select is(public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,'Assistant own',null,'library-test-gate')->'items'->0->>'uploaded_by','Assistant Yassine','assistant sees only authorized uploader identity');
reset role;

select set_config('request.jwt.claim.sub','a9200000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a9200000-0000-4000-8000-000000000003","session_id":"a9400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','imaging',null,null,'library-test-gate')$$,'22023',null,'reception cannot read clinical library categories');
select throws_ok($$select public.list_patient_document_library('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001',null,null,null,'library-test-gate','clinical')$$,'42501',null,'reception cannot read clinical tab');
select throws_ok($$select public.list_patient_documents('a9100000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','clinical',null,null,10,'library-test-gate')$$,'42501',null,'reception cannot read the legacy clinical proxy list');
select * from finish();
rollback;
