-- Upload-only patient library. The existing private bucket and authenticated
-- proxy remain the only byte access path; archive is metadata-only.
create table private.patient_document_library_catalog (
  category_id text primary key,
  label text not null,
  section text not null check(section in ('administrative','clinical')),
  legacy_category text not null,
  types jsonb not null check(jsonb_typeof(types)='array')
);
alter table private.patient_document_library_catalog enable row level security;
revoke all on private.patient_document_library_catalog from public,anon,authenticated,service_role;
insert into private.patient_document_library_catalog(category_id,label,section,legacy_category,types) values
('history','Antécédents & anamnèse','clinical','clinical_record','[{"id":"medical_history","label":"Questionnaire médical"},{"id":"dental_history","label":"Antécédents dentaires"},{"id":"anamnese","label":"Fiche d’anamnèse"}]'),
('examination','Examens cliniques','clinical','clinical_record','[{"id":"oral_exam","label":"Examen bucco-dentaire"},{"id":"periodontal_chart","label":"Bilan parodontal"},{"id":"occlusion_exam","label":"Bilan occlusal"}]'),
('imaging','Radiologie & imagerie','clinical','radiograph','[{"id":"panoramic","label":"Panoramique dentaire"},{"id":"retroalveolar","label":"Radiographie rétro-alvéolaire"},{"id":"bitewing","label":"Radiographie bite-wing"},{"id":"cbct_report","label":"Compte rendu / export CBCT"},{"id":"cephalometric","label":"Téléradiographie"},{"id":"legacy_unspecified","label":"Type non précisé (document existant)"}]'),
('photography','Photographies cliniques','clinical','clinical_photo','[{"id":"intraoral_photo","label":"Photographie intra-orale"},{"id":"extraoral_photo","label":"Photographie extra-orale"},{"id":"progress_photo","label":"Photographie de suivi"},{"id":"legacy_unspecified","label":"Type non précisé (document existant)"}]'),
('digital_scan','Scans numériques & CAD/CAM','clinical','clinical_record','[{"id":"scan_report","label":"Compte rendu de scan"},{"id":"scan_capture","label":"Capture de scan intra-oral"},{"id":"cadcam_export","label":"Export de présentation CAD/CAM"}]'),
('treatment_plan','Diagnostic & plans de traitement','clinical','clinical_record','[{"id":"diagnostic_report","label":"Bilan diagnostique externe"},{"id":"treatment_plan","label":"Plan de traitement"},{"id":"referral_plan","label":"Avis spécialisé"}]'),
('consent','Consentements','clinical','care_consent','[{"id":"care_consent","label":"Consentement aux soins"},{"id":"surgery_consent","label":"Consentement chirurgical"},{"id":"image_consent","label":"Autorisation d’utilisation des images"}]'),
('prescriptions','Ordonnances','clinical','prescription','[{"id":"medication_prescription","label":"Ordonnance médicamenteuse"},{"id":"imaging_prescription","label":"Prescription d’imagerie"},{"id":"laboratory_prescription","label":"Prescription d’examens"},{"id":"legacy_unspecified","label":"Type non précisé (document existant)"}]'),
('reports','Comptes rendus cliniques & chirurgicaux','clinical','report','[{"id":"consultation_report","label":"Compte rendu de consultation"},{"id":"surgical_report","label":"Compte rendu opératoire"},{"id":"clinical_letter","label":"Courrier clinique"},{"id":"legacy_unspecified","label":"Type non précisé (document existant)"}]'),
('laboratory','Documents de laboratoire','clinical','lab_result','[{"id":"prosthetic_order","label":"Fiche de laboratoire prothétique"},{"id":"lab_result","label":"Résultat d’analyse"},{"id":"prosthetic_certificate","label":"Certificat / traçabilité prothétique"}]'),
('external','Documents médicaux externes','clinical','clinical_record','[{"id":"referral_letter","label":"Lettre d’adressage"},{"id":"specialist_opinion","label":"Avis d’un spécialiste"},{"id":"external_record","label":"Dossier externe"}]'),
('follow_up','Suivi & surveillance','clinical','report','[{"id":"followup_report","label":"Compte rendu de contrôle"},{"id":"monitoring_sheet","label":"Fiche de suivi"},{"id":"postoperative_record","label":"Document de suivi postopératoire"}]'),
('administrative','Administratif / CNSS','administrative','other','[{"id":"identity","label":"Pièce d’identité"},{"id":"insurance","label":"Attestation d’assurance"},{"id":"cnss","label":"Formulaire CNSS"},{"id":"cnops","label":"Formulaire CNOPS"},{"id":"administrative_letter","label":"Courrier administratif"},{"id":"legacy_unspecified","label":"Type non précisé (document existant)"}]'),
('other','Autres documents','clinical','other','[{"id":"other","label":"Autre document médical"},{"id":"legacy_unspecified","label":"Type non précisé (document existant)"}]');

alter table private.patient_document_uploads
  add column library_category text,
  add column library_type text,
  add column library_document_date date,
  add column library_notes text not null default '',
  add column related_appointment_id uuid,
  add column original_file_name text,
  add column library_version integer not null default 1 check(library_version>0),
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id),
  add constraint patient_document_library_notes_length check(length(library_notes)<=2000),
  add constraint patient_document_library_delete_pair check((deleted_at is null)=(deleted_by is null));

create function private.patient_document_legacy_library_mapping(p_section text,p_category text)
returns table(library_category text,library_type text)
language sql immutable set search_path='' as $$
 select case
   when p_section='administrative' then 'administrative'
   when p_category='radiograph' then 'imaging'
   when p_category='clinical_photo' then 'photography'
   when p_category='prescription' then 'prescriptions'
   when p_category='report' then 'reports'
   when p_category='lab_result' then 'laboratory'
   when p_category='care_consent' then 'consent'
   else 'other' end,
  case
   when p_category in ('identity','insurance','cnss','cnops') then p_category
   when p_category='lab_result' then 'lab_result'
   when p_category='care_consent' then 'care_consent'
   when p_category='other' and p_section='clinical' then 'other'
   else 'legacy_unspecified' end
$$;
revoke all on function private.patient_document_legacy_library_mapping(text,text) from public,anon,authenticated,service_role;

update private.patient_document_uploads u set
  library_category=(select m.library_category from private.patient_document_legacy_library_mapping(u.section,u.category) m),
  library_type=(select m.library_type from private.patient_document_legacy_library_mapping(u.section,u.category) m),
  library_document_date=u.document_date,
  library_notes='',
  original_file_name=u.title;

alter table private.patient_document_uploads alter column library_category set not null, alter column library_type set not null, alter column original_file_name set not null;
alter table private.patient_document_uploads add constraint patient_document_library_category_type foreign key(library_category) references private.patient_document_library_catalog(category_id);
create index patient_document_library_active_list on private.patient_document_uploads(clinic_id,patient_id,created_at desc,id desc) where deleted_at is null;
create index patient_document_library_appointment on private.patient_document_uploads(clinic_id,related_appointment_id) where related_appointment_id is not null;

create function private.map_patient_document_library_upload() returns trigger
language plpgsql set search_path='' as $$
declare v_mapping record;
begin
 if new.library_category is null or new.library_type is null then
   select * into v_mapping from private.patient_document_legacy_library_mapping(new.section,new.category);
   new.library_category:=v_mapping.library_category;
   new.library_type:=v_mapping.library_type;
   new.library_document_date:=new.document_date;
   new.library_notes:='';
 end if;
 if new.original_file_name is null then new.original_file_name:=new.title; end if;
 return new;
end $$;
revoke all on function private.map_patient_document_library_upload() from public,anon,authenticated,service_role;
create trigger map_patient_document_library_upload before insert on private.patient_document_uploads for each row execute function private.map_patient_document_library_upload();

create function public.read_patient_document_library_options(p_clinic_id uuid,p_patient_id uuid,p_gate text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_categories jsonb;v_appointments jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled';end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception using errcode='PT404',message='patient unavailable';end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant','reception')) then raise exception using errcode='42501',message='document scope denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.category_id,'label',c.label,'section',c.section,'types',c.types) order by c.category_id),'[]'::jsonb) into v_categories
 from private.patient_document_library_catalog c where c.section='administrative' or exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant'));
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label',to_char(a.starts_at at time zone 'Africa/Casablanca','YYYY-MM-DD HH24:MI')) order by a.starts_at desc,a.id),'[]'::jsonb) into v_appointments
 from private.demo_confirmed_appointments a where a.clinic_id=p_clinic_id and a.patient_id=p_patient_id;
 return jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'categories',v_categories,'appointments',v_appointments);
end $$;
revoke all on function public.read_patient_document_library_options(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_patient_document_library_options(uuid,uuid,text) to authenticated;

create function public.list_patient_document_library(p_clinic_id uuid,p_patient_id uuid,p_category text,p_query text,p_cursor text,p_gate text,p_section text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_rows jsonb;v_next text;v_count integer;v_cut timestamptz;v_cut_id uuid;v_cursor text;v_query text:=nullif(btrim(p_query),'');v_allowed boolean;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled';end if;
 if length(coalesce(p_query,''))>100 or p_query is not null and btrim(p_query)<>p_query or p_cursor is not null and length(p_cursor)>300 or p_section is not null and p_section not in('administrative','clinical') then raise exception using errcode='22023',message='invalid library query';end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception using errcode='PT404',message='patient unavailable';end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant','reception')) then raise exception using errcode='42501',message='document scope denied';end if;
 if p_category is not null and not exists(select 1 from private.patient_document_library_catalog c where c.category_id=p_category and (p_section is null or c.section=p_section) and (c.section='administrative' or exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant')))) then raise exception using errcode='22023',message='invalid library category';end if;
 if p_section='clinical' and not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant')) then raise exception using errcode='42501',message='document scope denied';end if;
 if p_cursor is not null then begin v_cursor:=convert_from(decode(split_part(p_cursor,'.',1),'base64'),'UTF8');v_cut:=split_part(v_cursor,'|',1)::timestamptz;v_cut_id:=split_part(v_cursor,'|',2)::uuid;exception when others then raise exception using errcode='22023',message='invalid library cursor';end;end if;
 with page as (
   select u.*,row_number() over(order by u.created_at desc,u.id desc) rn
   from private.patient_document_uploads u join private.patient_document_library_catalog c on c.category_id=u.library_category
   where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.deleted_at is null
    and (p_category is null or u.library_category=p_category)
    and (p_section is null or c.section=p_section)
    and (c.section='administrative' or exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant')))
    and (v_query is null or strpos(lower(u.title||' '||u.library_notes||' '||u.library_type),lower(v_query))>0)
    and (p_cursor is null or (u.created_at,u.id)<(v_cut,v_cut_id))
   order by u.created_at desc,u.id desc limit 11
 ), projected as (
   select p.*,exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist')) or p.created_by=v_uid can_manage
   from page p
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'clinic_id',clinic_id,'patient_id',patient_id,'category',library_category,'type',library_type,'title',title,'document_date',library_document_date,'notes',library_notes,'related_appointment_id',related_appointment_id,'content_type',content_type,'size_bytes',size_bytes,'created_at',created_at,'uploaded_by',coalesce((select p.display_name from public.profiles p where p.user_id=projected.created_by),'Équipe'),'version',library_version,'can_edit',can_manage,'can_delete',can_manage) order by created_at desc,id desc) filter(where rn<=10),'[]'::jsonb),
 (select count(*) from projected),(select encode(convert_to((created_at::text||'|'||id::text),'UTF8'),'base64')||'.1' from projected where rn=10 and (select count(*) from projected)>10)
 into v_rows,v_count,v_next from projected;
 return jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'items',v_rows,'next_cursor',case when v_count>10 then v_next else null end);
end $$;
revoke all on function public.list_patient_document_library(uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.list_patient_document_library(uuid,uuid,text,text,text,text,text) to authenticated;

create function public.register_patient_document_library_upload(p_clinic_id uuid,p_patient_id uuid,p_id uuid,p_category text,p_type text,p_title text,p_document_date date,p_notes text,p_related_appointment_id uuid,p_original_file_name text,p_content_type text,p_size_bytes integer,p_sha256 text,p_storage_path text,p_request_key uuid,p_correlation_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_cat private.patient_document_library_catalog%rowtype;v_legacy_category text;v_hash text;v_prior private.patient_document_command_receipts%rowtype;v_item jsonb;v_title text:=nullif(btrim(p_title),'');
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled';end if;
 select * into v_cat from private.patient_document_library_catalog c where c.category_id=p_category and exists(select 1 from jsonb_array_elements(c.types) t where t->>'id'=p_type);
 if not found or length(coalesce(p_notes,''))>2000 or length(coalesce(p_original_file_name,''))>255 or p_content_type not in('application/pdf','image/jpeg','image/png') or p_size_bytes not between 1 and 20971520 or p_sha256 !~ '^[0-9a-f]{64}$' or p_storage_path !~ ('^'||p_clinic_id::text||'/'||p_patient_id::text||'/'||v_cat.section||'/'||p_id::text||'$') then raise exception using errcode='22023',message='invalid library upload';end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((v_cat.section='administrative' and m.role in('manager','dentist','assistant','reception')) or (v_cat.section='clinical' and m.role in('manager','dentist','assistant')))) then raise exception using errcode='42501',message='document scope denied';end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception using errcode='PT404',message='patient unavailable';end if;
 if p_related_appointment_id is not null and not exists(select 1 from private.demo_confirmed_appointments a where a.id=p_related_appointment_id and a.clinic_id=p_clinic_id and a.patient_id=p_patient_id) then raise exception using errcode='PT404',message='appointment unavailable';end if;
 if v_title is null then v_title:=left(nullif(btrim(p_original_file_name),''),160);end if;
 if v_title is null or length(v_title)>160 then raise exception using errcode='22023',message='invalid library title';end if;
 v_legacy_category:=case when v_cat.section='administrative' then case when p_type in('identity','insurance','cnss','cnops') then p_type else 'other' end else v_cat.legacy_category end;
 v_hash:=encode(extensions.digest(jsonb_build_object('category',p_category,'type',p_type,'title',v_title,'document_date',p_document_date,'notes',coalesce(p_notes,''),'appointment',p_related_appointment_id,'filename',p_original_file_name,'sha256',p_sha256,'size',p_size_bytes,'content_type',p_content_type)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_key::text,0));
 -- A manager/reception/clinician may have been revoked while this request
 -- waited for an identical idempotency key. Re-check current authority before
 -- replaying a receipt or committing metadata.
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((v_cat.section='administrative' and m.role in('manager','dentist','assistant','reception')) or (v_cat.section='clinical' and m.role in('manager','dentist','assistant')))) then raise exception using errcode='42501',message='document scope denied';end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception using errcode='PT404',message='patient unavailable';end if;
 if p_related_appointment_id is not null and not exists(select 1 from private.demo_confirmed_appointments a where a.id=p_related_appointment_id and a.clinic_id=p_clinic_id and a.patient_id=p_patient_id) then raise exception using errcode='PT404',message='appointment unavailable';end if;
 select * into v_prior from private.patient_document_command_receipts r where r.actor_id=v_uid and r.request_key=p_request_key;
 if found then
   if v_prior.action<>'library_upload' or v_prior.clinic_id<>p_clinic_id or v_prior.patient_id<>p_patient_id or v_prior.payload_hash<>v_hash then raise exception using errcode='PT409',message='idempotency conflict';end if;
   if exists(select 1 from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.id=(v_prior.response->'item'->>'id')::uuid and u.deleted_at is not null) then raise exception using errcode='PT404',message='document unavailable';end if;
   return jsonb_build_object('item',v_prior.response->'item','replayed',true);
 end if;
 insert into private.patient_document_uploads(clinic_id,patient_id,id,section,category,title,document_date,content_type,size_bytes,sha256_hex,storage_path,created_by,library_category,library_type,library_document_date,library_notes,related_appointment_id,original_file_name)
 values(p_clinic_id,p_patient_id,p_id,v_cat.section,v_legacy_category,v_title,coalesce(p_document_date,current_date),p_content_type,p_size_bytes,p_sha256,p_storage_path,v_uid,p_category,p_type,p_document_date,coalesce(p_notes,''),p_related_appointment_id,p_original_file_name);
 select jsonb_build_object('id',u.id,'clinic_id',u.clinic_id,'patient_id',u.patient_id,'category',u.library_category,'type',u.library_type,'title',u.title,'document_date',u.library_document_date,'notes',u.library_notes,'related_appointment_id',u.related_appointment_id,'content_type',u.content_type,'size_bytes',u.size_bytes,'created_at',u.created_at,'uploaded_by',coalesce(p.display_name,'Équipe'),'version',u.library_version,'can_edit',true,'can_delete',true) into v_item from private.patient_document_uploads u left join public.profiles p on p.user_id=u.created_by where u.clinic_id=p_clinic_id and u.id=p_id;
 insert into private.patient_document_command_receipts(actor_id,request_key,action,clinic_id,patient_id,payload_hash,response) values(v_uid,p_request_key,'library_upload',p_clinic_id,p_patient_id,v_hash,jsonb_build_object('item',v_item));
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_uid,'patient_document.library_uploaded',p_id,p_correlation_id);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'PatientDocumentLibraryUploaded',1,'patient_document',p_id,p_correlation_id,v_uid,jsonb_build_object('category',p_category,'type',p_type));
 return jsonb_build_object('item',v_item,'replayed',false);
end $$;
revoke all on function public.register_patient_document_library_upload(uuid,uuid,uuid,text,text,text,date,text,uuid,text,text,integer,text,text,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.register_patient_document_library_upload(uuid,uuid,uuid,text,text,text,date,text,uuid,text,text,integer,text,text,uuid,uuid,text) to authenticated;

create function public.update_patient_document_library_metadata(p_clinic_id uuid,p_patient_id uuid,p_document_id uuid,p_expected_version integer,p_category text,p_type text,p_title text,p_document_date date,p_notes text,p_related_appointment_id uuid,p_request_key uuid,p_correlation_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_doc private.patient_document_uploads%rowtype;v_new_cat private.patient_document_library_catalog%rowtype;v_hash text;v_prior private.patient_document_command_receipts%rowtype;v_item jsonb;v_title text:=nullif(btrim(p_title),'');v_legacy text;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled';end if;
 select * into v_doc from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.id=p_document_id and u.deleted_at is null for update;
 if not found then raise exception using errcode='PT404',message='document unavailable';end if;
 select * into v_new_cat from private.patient_document_library_catalog c where c.category_id=p_category and exists(select 1 from jsonb_array_elements(c.types) t where t->>'id'=p_type);
 if not found or p_expected_version<1 or length(coalesce(p_notes,''))>2000 then raise exception using errcode='22023',message='invalid library metadata';end if;
 if p_related_appointment_id is not null and not exists(select 1 from private.demo_confirmed_appointments a where a.id=p_related_appointment_id and a.clinic_id=p_clinic_id and a.patient_id=p_patient_id) then raise exception using errcode='PT404',message='appointment unavailable';end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((m.role in('manager','dentist')) or (v_doc.created_by=v_uid and ((v_doc.section='administrative' and m.role in('reception','assistant')) or (v_doc.section='clinical' and m.role='assistant'))))) then raise exception using errcode='42501',message='document scope denied';end if;
 if v_new_cat.section='clinical' and not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant')) then raise exception using errcode='42501',message='document scope denied';end if;
 if v_new_cat.section='administrative' and not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant','reception')) then raise exception using errcode='42501',message='document scope denied';end if;
 if v_title is null then v_title:=left(v_doc.original_file_name,160);end if;if v_title is null or length(v_title)>160 then raise exception using errcode='22023',message='invalid library title';end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('document',p_document_id,'expected_version',p_expected_version,'category',p_category,'type',p_type,'title',v_title,'document_date',p_document_date,'notes',coalesce(p_notes,''),'appointment',p_related_appointment_id)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_key::text,0));
 -- Recheck role and ownership after both the document row lock and command lock.
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((m.role in('manager','dentist')) or (v_doc.created_by=v_uid and ((v_doc.section='administrative' and m.role in('reception','assistant')) or (v_doc.section='clinical' and m.role='assistant'))))) then raise exception using errcode='42501',message='document scope denied';end if;
 if v_new_cat.section='clinical' and not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant')) then raise exception using errcode='42501',message='document scope denied';end if;
 if v_new_cat.section='administrative' and not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('manager','dentist','assistant','reception')) then raise exception using errcode='42501',message='document scope denied';end if;
 select * into v_prior from private.patient_document_command_receipts r where r.actor_id=v_uid and r.request_key=p_request_key;
 if found then if v_prior.action<>'library_metadata_update' or v_prior.clinic_id<>p_clinic_id or v_prior.patient_id<>p_patient_id or v_prior.payload_hash<>v_hash then raise exception using errcode='PT409',message='idempotency conflict';end if;return jsonb_build_object('item',v_prior.response->'item','replayed',true);end if;
 if v_doc.library_version<>p_expected_version then raise exception using errcode='PT409',message='stale library metadata';end if;
 v_legacy:=case when v_new_cat.section='administrative' then case when p_type in('identity','insurance','cnss','cnops') then p_type else 'other' end else v_new_cat.legacy_category end;
 update private.patient_document_uploads set section=v_new_cat.section,category=v_legacy,title=v_title,document_date=coalesce(p_document_date,current_date),library_category=p_category,library_type=p_type,library_document_date=p_document_date,library_notes=coalesce(p_notes,''),related_appointment_id=p_related_appointment_id,library_version=library_version+1 where clinic_id=p_clinic_id and id=p_document_id;
 select jsonb_build_object('id',u.id,'clinic_id',u.clinic_id,'patient_id',u.patient_id,'category',u.library_category,'type',u.library_type,'title',u.title,'document_date',u.library_document_date,'notes',u.library_notes,'related_appointment_id',u.related_appointment_id,'content_type',u.content_type,'size_bytes',u.size_bytes,'created_at',u.created_at,'uploaded_by',coalesce(p.display_name,'Équipe'),'version',u.library_version,'can_edit',true,'can_delete',true) into v_item from private.patient_document_uploads u left join public.profiles p on p.user_id=u.created_by where u.clinic_id=p_clinic_id and u.id=p_document_id;
 insert into private.patient_document_command_receipts(actor_id,request_key,action,clinic_id,patient_id,payload_hash,response) values(v_uid,p_request_key,'library_metadata_update',p_clinic_id,p_patient_id,v_hash,jsonb_build_object('item',v_item));
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_uid,'patient_document.library_metadata_updated',p_document_id,p_correlation_id);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'PatientDocumentLibraryMetadataUpdated',1,'patient_document',p_document_id,p_correlation_id,v_uid,jsonb_build_object('version',v_doc.library_version+1,'category',p_category,'type',p_type));
 return jsonb_build_object('item',v_item,'replayed',false);
end $$;
revoke all on function public.update_patient_document_library_metadata(uuid,uuid,uuid,integer,text,text,text,date,text,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.update_patient_document_library_metadata(uuid,uuid,uuid,integer,text,text,text,date,text,uuid,uuid,uuid,text) to authenticated;

create function public.archive_patient_document_library_item(p_clinic_id uuid,p_patient_id uuid,p_document_id uuid,p_expected_version integer,p_request_key uuid,p_correlation_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_doc private.patient_document_uploads%rowtype;v_hash text;v_prior private.patient_document_command_receipts%rowtype;v_receipt jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled';end if;
 select * into v_doc from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.id=p_document_id for update;
 if not found then raise exception using errcode='PT404',message='document unavailable';end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((m.role in('manager','dentist')) or (v_doc.created_by=v_uid and ((v_doc.section='administrative' and m.role in('reception','assistant')) or (v_doc.section='clinical' and m.role='assistant'))))) then raise exception using errcode='42501',message='document scope denied';end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('document',p_document_id,'expected_version',p_expected_version,'archive',true)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_key::text,0));
 -- The document row may have been locked while this actor lost their role.
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((m.role in('manager','dentist')) or (v_doc.created_by=v_uid and ((v_doc.section='administrative' and m.role in('reception','assistant')) or (v_doc.section='clinical' and m.role='assistant'))))) then raise exception using errcode='42501',message='document scope denied';end if;
 select * into v_prior from private.patient_document_command_receipts r where r.actor_id=v_uid and r.request_key=p_request_key;
 if found then if v_prior.action<>'library_archive' or v_prior.clinic_id<>p_clinic_id or v_prior.patient_id<>p_patient_id or v_prior.payload_hash<>v_hash then raise exception using errcode='PT409',message='idempotency conflict';end if;return jsonb_build_object('id',p_document_id,'clinic_id',p_clinic_id,'patient_id',p_patient_id,'deleted',true,'replayed',true);end if;
 if v_doc.deleted_at is not null then raise exception using errcode='PT404',message='document unavailable';end if;
 if v_doc.library_version<>p_expected_version then raise exception using errcode='PT409',message='stale library metadata';end if;
 update private.patient_document_uploads set deleted_at=now(),deleted_by=v_uid,library_version=library_version+1 where clinic_id=p_clinic_id and id=p_document_id;
 v_receipt:=jsonb_build_object('id',p_document_id,'clinic_id',p_clinic_id,'patient_id',p_patient_id,'deleted',true,'replayed',false);
 insert into private.patient_document_command_receipts(actor_id,request_key,action,clinic_id,patient_id,payload_hash,response) values(v_uid,p_request_key,'library_archive',p_clinic_id,p_patient_id,v_hash,v_receipt);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_uid,'patient_document.library_archived',p_document_id,p_correlation_id);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'PatientDocumentLibraryArchived',1,'patient_document',p_document_id,p_correlation_id,v_uid,jsonb_build_object('version',v_doc.library_version+1));
 return v_receipt;
end $$;
revoke all on function public.archive_patient_document_library_item(uuid,uuid,uuid,integer,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.archive_patient_document_library_item(uuid,uuid,uuid,integer,uuid,uuid,text) to authenticated;

-- The existing proxy must stop serving archived uploads too. Validated clinical
-- versions keep their existing dentist/assistant access policy.
create or replace function public.read_patient_document_content(p_clinic_id uuid,p_patient_id uuid,p_document_id uuid,p_gate text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_item jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled';end if;
 if exists(select 1 from private.patient_document_uploads u join public.clinic_memberships m on m.clinic_id=u.clinic_id and m.user_id=v_uid and m.active where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.id=p_document_id and u.deleted_at is null and ((u.section='administrative' and m.role in('manager','reception','assistant','dentist')) or (u.section='clinical' and m.role in('dentist','assistant','manager')))) then
  select jsonb_build_object('kind','upload','clinic_id',u.clinic_id,'patient_id',u.patient_id,'document_id',u.id,'content_type',u.content_type,'size_bytes',u.size_bytes,'sha256',u.sha256_hex,'storage_path',u.storage_path,'title',u.title,'document_date',u.document_date) into v_item from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.id=p_document_id and u.deleted_at is null;
  return v_item;
 end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('dentist','assistant')) then raise exception using errcode='42501',message='document scope denied';end if;
 select jsonb_build_object('kind','generated','clinic_id',v.clinic_id,'patient_id',v.patient_id,'document_id',v.id,'title',v.title,'document_date',v.document_date,'type',v.document_type,'content',v.content,'template_id',v.template_id,'template_version',v.template_version,'version',v.version,'patient_name',v.patient_name,'patient_reference',v.patient_reference,'clinic_name',v.clinic_name,'validated_by_name',v.validated_by_name,'validated_at',v.validated_at) into v_item from private.patient_document_versions v where v.clinic_id=p_clinic_id and v.patient_id=p_patient_id and v.id=p_document_id;
 if v_item is null then raise exception using errcode='PT404',message='document unavailable';end if;return v_item;
end $$;

-- V1 operational tabs remain available for generated records, but all imported
-- files are now rendered by the catalog-driven library only.
create or replace function public.list_patient_documents(p_clinic_id uuid,p_patient_id uuid,p_section text,p_query text,p_cursor text,p_limit integer,p_gate text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_role_ok boolean;v_rows jsonb;v_next text;v_cut timestamptz;v_cut_id uuid;v_cursor text;v_query text:=nullif(btrim(p_query),'');
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled';end if;
 if p_section not in('administrative','clinical') or p_limit not between 1 and 10 or length(coalesce(p_query,''))>100 then raise exception using errcode='22023',message='invalid document query';end if;
 select exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((p_section='administrative' and m.role in('manager','reception','assistant','dentist')) or (p_section='clinical' and m.role in('dentist','assistant','manager')))) into v_role_ok;
 if not coalesce(v_role_ok,false) then raise exception using errcode='42501',message='document scope denied';end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception using errcode='PT404',message='patient unavailable';end if;
 if p_cursor is not null then begin v_cursor:=convert_from(decode(split_part(p_cursor,'.',1),'base64'),'UTF8');v_cut:=split_part(v_cursor,'|',1)::timestamptz;v_cut_id:=split_part(v_cursor,'|',2)::uuid;exception when others then raise exception using errcode='22023',message='invalid cursor';end;end if;
 with docs as (
  select u.id,u.clinic_id,u.patient_id,u.section,u.category,'upload'::text document_type,u.title,u.document_date,u.content_type,u.size_bytes,u.created_at,u.created_by,u.finalized_at,1 version,'upload'::text source,null::uuid template_id,null::integer template_version
  from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.section=p_section and u.deleted_at is null and u.library_category is null
  union all
  select v.id,v.clinic_id,v.patient_id,'clinical'::text,v.document_type::text,v.document_type,v.title,v.document_date,'application/json'::text,octet_length(v.content::text),v.finalized_at,v.created_by,v.finalized_at,v.version,'generated'::text,v.template_id,v.template_version
  from private.patient_document_versions v where v.clinic_id=p_clinic_id and v.patient_id=p_patient_id and p_section='clinical' and exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('dentist','assistant'))
 ), filtered as (
  select * from docs d where (v_query is null or strpos(lower(d.title),lower(v_query))>0) and (p_cursor is null or (d.created_at,d.id)<(v_cut,v_cut_id)) order by d.created_at desc,d.id desc limit p_limit+1
 ), numbered as (select f.*,row_number() over(order by f.created_at desc,f.id desc) rn from filtered f)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'clinic_id',clinic_id,'patient_id',patient_id,'section',section,'category',category,'document_type',document_type,'title',title,'document_date',document_date,'content_type',content_type,'size_bytes',size_bytes,'created_at',created_at,'created_by',created_by,'finalized_at',finalized_at,'version',version,'source',source,'status',case when source='upload' then 'stored' else 'validated' end,'template_id',template_id,'template_version',template_version) order by created_at desc,id desc) filter(where rn<=p_limit),'[]'::jsonb),(select encode(convert_to((created_at::text||'|'||id::text),'UTF8'),'base64')||'.1' from numbered where rn=p_limit and (select count(*) from numbered)>p_limit) into v_rows,v_next from numbered;
 return jsonb_build_object('schema_version',1,'clinic_id',p_clinic_id,'patient_id',p_patient_id,'section',p_section,'items',v_rows,'next_cursor',v_next);
end $$;
