-- Patient documents are private, local-development-only drafts until their
-- clinical/privacy activation gate is reviewed. No patient portal release.
create extension if not exists pgcrypto with schema extensions;
create table private.patient_documents_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  api_gate_key text not null default ''
);
insert into private.patient_documents_settings(singleton, enabled, api_gate_key) values (true, false, '');

create table private.patient_document_templates (
  clinic_id uuid not null references public.clinics(id),
  id uuid not null default gen_random_uuid(),
  document_type text not null check (document_type in ('report','prescription')),
  version integer not null check (version > 0),
  label text not null check (length(label) between 1 and 120),
  initial_content jsonb not null default '{"body":""}'::jsonb check (initial_content = '{"body":""}'::jsonb),
  created_at timestamptz not null default now(),
  primary key (clinic_id,id,version),
  unique (clinic_id,document_type,version)
);
create table private.patient_document_uploads (
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null,
  id uuid not null,
  section text not null check (section in ('administrative','clinical')),
  category text not null,
  title text not null check (length(title) between 1 and 160),
  document_date date not null,
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz not null default now(),
  foreign key (clinic_id,patient_id) references public.patients(clinic_id,id),
  primary key (clinic_id,id),
  check ((section='administrative' and category in ('identity','insurance','cnss','cnops','other')) or
         (section='clinical' and category in ('report','prescription','clinical_record','radiograph','clinical_photo','lab_result','care_consent','other'))),
  check (storage_path ~ ('^' || clinic_id::text || '/' || patient_id::text || '/' || section || '/' || id::text || '$'))
);
create table private.patient_document_drafts (
  clinic_id uuid not null references public.clinics(id), patient_id uuid not null, id uuid not null default gen_random_uuid(),
  document_type text not null check(document_type in ('report','prescription')),
  title text not null check(length(title) between 1 and 160), document_date date not null,
  template_id uuid not null, template_version integer not null,
  content jsonb not null check(jsonb_typeof(content)='object' and content ? 'body' and length(content->>'body')<=30000),
  version integer not null default 1 check(version > 0), status text not null default 'draft' check(status in ('draft','validated')),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (clinic_id,patient_id) references public.patients(clinic_id,id),
  foreign key (clinic_id,template_id,template_version) references private.patient_document_templates(clinic_id,id,version),
  primary key(clinic_id,id)
);
create table private.patient_document_draft_history (
  clinic_id uuid not null, patient_id uuid not null, draft_id uuid not null, version integer not null check(version>0),
  title text not null, document_date date not null, content jsonb not null, updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(), primary key(clinic_id,draft_id,version),
  foreign key(clinic_id,draft_id) references private.patient_document_drafts(clinic_id,id)
);
create function private.reject_patient_document_history_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception using errcode='42501',message='draft history is immutable'; end $$;
create trigger patient_document_draft_history_immutable before update or delete on private.patient_document_draft_history
 for each row execute function private.reject_patient_document_history_mutation();
create table private.patient_document_versions (
  clinic_id uuid not null references public.clinics(id), patient_id uuid not null, id uuid not null default gen_random_uuid(),
  draft_id uuid not null, version integer not null check(version > 0), document_type text not null check(document_type in ('report','prescription')),
  title text not null, document_date date not null, template_id uuid not null, template_version integer not null,
  content jsonb not null, patient_name text not null, patient_reference text not null, clinic_name text not null,
  validated_by_name text not null, validated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), finalized_at timestamptz not null default now(),
  foreign key (clinic_id,patient_id) references public.patients(clinic_id,id),
  foreign key (clinic_id,template_id,template_version) references private.patient_document_templates(clinic_id,id,version),
  primary key(clinic_id,id), unique(clinic_id,draft_id,version)
);
create table private.patient_document_command_receipts (
  actor_id uuid not null references auth.users(id), request_key uuid not null, action text not null,
  clinic_id uuid not null, patient_id uuid not null, payload_hash text not null,
  response jsonb not null, created_at timestamptz not null default now(),
  primary key(actor_id,request_key),
  foreign key(clinic_id,patient_id) references public.patients(clinic_id,id)
);
create index patient_document_uploads_list on private.patient_document_uploads(clinic_id,patient_id,section,created_at desc,id desc);
create index patient_document_versions_list on private.patient_document_versions(clinic_id,patient_id,finalized_at desc,id desc);
create index patient_document_drafts_list on private.patient_document_drafts(clinic_id,patient_id,updated_at desc,id desc) where status='draft';

alter table private.patient_documents_settings enable row level security;
alter table private.patient_document_templates enable row level security;
alter table private.patient_document_uploads enable row level security;
alter table private.patient_document_drafts enable row level security;
alter table private.patient_document_draft_history enable row level security;
alter table private.patient_document_versions enable row level security;
alter table private.patient_document_command_receipts enable row level security;
revoke all on private.patient_documents_settings,private.patient_document_templates,private.patient_document_uploads,
  private.patient_document_drafts,private.patient_document_versions,private.patient_document_command_receipts
  ,private.patient_document_draft_history from public,anon,authenticated,service_role;

create function private.patient_documents_gate_valid(p_gate text) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((select enabled and api_gate_key<>'' and api_gate_key=p_gate from private.patient_documents_settings where singleton)
   and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now())),false)
$$;
revoke all on function private.patient_documents_gate_valid(text) from public,anon,authenticated,service_role;

-- Blank template seeds are explicit empty shells. No medicines, diagnoses,
-- instructions, clinical wording, or signatures are inferred or inserted.
create function private.seed_patient_document_templates(p_clinic_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 insert into private.patient_document_templates(clinic_id,document_type,version,label)
 select p_clinic_id,t.document_type,1,t.label from (values ('report','Modèle vierge de compte rendu'),('prescription','Modèle vierge d’ordonnance')) t(document_type,label)
 where exists(select 1 from public.clinics c where c.id=p_clinic_id)
 and not exists(select 1 from private.patient_document_templates x where x.clinic_id=p_clinic_id and x.document_type=t.document_type and x.version=1);
end $$;
revoke all on function private.seed_patient_document_templates(uuid) from public,anon,authenticated,service_role;
create function private.reject_patient_document_template_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception using errcode='42501',message='templates are versioned and immutable'; end $$;
create trigger patient_document_templates_immutable before update or delete on private.patient_document_templates
 for each row execute function private.reject_patient_document_template_mutation();
create function private.reject_patient_document_version_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception using errcode='42501',message='validated document versions are immutable'; end $$;
create trigger patient_document_versions_immutable before update or delete on private.patient_document_versions
 for each row execute function private.reject_patient_document_version_mutation();

create function public.list_patient_documents(p_clinic_id uuid,p_patient_id uuid,p_section text,p_query text,p_cursor text,p_limit integer,p_gate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_role_ok boolean; v_rows jsonb; v_next text; v_cut timestamptz; v_cut_id uuid; v_cursor text; v_query text:=nullif(btrim(p_query),'');
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 if p_section not in ('administrative','clinical') or p_limit not between 1 and 10 or length(coalesce(p_query,''))>100 then raise exception using errcode='22023',message='invalid document query'; end if;
 select exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and
   ((p_section='administrative' and m.role in ('manager','reception','assistant','dentist')) or (p_section='clinical' and m.role in ('dentist','assistant','manager')))) into v_role_ok;
 if not coalesce(v_role_ok,false) then raise exception using errcode='42501',message='document scope denied'; end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception using errcode='PT404',message='patient unavailable'; end if;
 if p_cursor is not null then
   begin v_cursor:=convert_from(decode(split_part(p_cursor,'.',1),'base64'),'UTF8'); v_cut:=split_part(v_cursor,'|',1)::timestamptz; v_cut_id:=split_part(v_cursor,'|',2)::uuid;
   exception when others then raise exception using errcode='22023',message='invalid cursor'; end;
 end if;
 with docs as (
   select u.id,u.clinic_id,u.patient_id,u.section,u.category,'upload'::text document_type,u.title,u.document_date,u.content_type,u.size_bytes,u.created_at,u.created_by,u.finalized_at,1 version,'upload'::text source,null::uuid template_id,null::integer template_version
   from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.section=p_section
   union all
   select v.id,v.clinic_id,v.patient_id,'clinical'::text,v.document_type::text,v.document_type,v.title,v.document_date,'application/json'::text,octet_length(v.content::text),v.finalized_at,v.created_by,v.finalized_at,v.version,'generated'::text,v.template_id,v.template_version
   from private.patient_document_versions v where v.clinic_id=p_clinic_id and v.patient_id=p_patient_id and p_section='clinical'
     and exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('dentist','assistant'))
 ), filtered as (
   select * from docs d where (v_query is null or strpos(lower(d.title),lower(v_query))>0)
    and (p_cursor is null or (d.created_at,d.id)<(v_cut,v_cut_id)) order by d.created_at desc,d.id desc limit p_limit+1
 ), numbered as (select f.*,row_number() over(order by f.created_at desc,f.id desc) rn from filtered f)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'clinic_id',clinic_id,'patient_id',patient_id,'section',section,'category',category,'document_type',document_type,'title',title,'document_date',document_date,'content_type',content_type,'size_bytes',size_bytes,'created_at',created_at,'created_by',created_by,'finalized_at',finalized_at,'version',version,'source',source,'status',case when source='upload' then 'stored' else 'validated' end,'template_id',template_id,'template_version',template_version) order by created_at desc,id desc) filter(where rn<=p_limit),'[]'::jsonb),
   (select encode(convert_to((created_at::text||'|'||id::text),'UTF8'),'base64')||'.1' from numbered where rn=p_limit and (select count(*) from numbered)>p_limit)
 into v_rows,v_next from numbered;
 return jsonb_build_object('schema_version',1,'clinic_id',p_clinic_id,'patient_id',p_patient_id,'section',p_section,'items',v_rows,'next_cursor',v_next);
end $$;

create function public.register_patient_document_upload(p_clinic_id uuid,p_patient_id uuid,p_id uuid,p_section text,p_category text,p_title text,p_document_date date,p_content_type text,p_size_bytes integer,p_sha256 text,p_storage_path text,p_request_key uuid,p_correlation_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_role_ok boolean; v_payload jsonb; v_hash text; v_prior private.patient_document_command_receipts; v_item jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 if p_section not in('administrative','clinical') or p_size_bytes not between 1 and 20971520 or p_content_type not in('application/pdf','image/jpeg','image/png') or length(p_title) not between 1 and 160 or p_category not in('identity','insurance','cnss','cnops','other','report','prescription','clinical_record','radiograph','clinical_photo','lab_result','care_consent') or p_sha256 !~ '^[0-9a-f]{64}$' or p_storage_path !~ ('^'||p_clinic_id::text||'/'||p_patient_id::text||'/'||p_section||'/'||p_id::text||'$') then raise exception using errcode='22023',message='invalid upload metadata'; end if;
 select exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((p_section='administrative' and m.role in('manager','reception','assistant','dentist')) or (p_section='clinical' and m.role in('dentist','assistant','manager')))) into v_role_ok;
 if not coalesce(v_role_ok,false) then raise exception using errcode='42501',message='document scope denied'; end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=p_clinic_id) then raise exception using errcode='PT404',message='patient unavailable'; end if;
 if (p_section='administrative' and p_category not in('identity','insurance','cnss','cnops','other')) or (p_section='clinical' and p_category not in('report','prescription','clinical_record','radiograph','clinical_photo','lab_result','care_consent','other')) then raise exception using errcode='22023',message='category does not match section'; end if;
 v_payload:=jsonb_build_object('patient_id',p_patient_id,'section',p_section,'category',p_category,'title',p_title,'document_date',p_document_date,'content_type',p_content_type,'size_bytes',p_size_bytes,'sha256',p_sha256); v_hash:=encode(extensions.digest(v_payload::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_key::text,0));
 select * into v_prior from private.patient_document_command_receipts r where r.actor_id=v_uid and r.request_key=p_request_key;
 if found then if v_prior.action<>'upload' or v_prior.clinic_id<>p_clinic_id or v_prior.patient_id<>p_patient_id or v_prior.payload_hash<>v_hash then raise exception using errcode='PT409',message='idempotency conflict'; end if; return jsonb_build_object('item',v_prior.response,'replayed',true); end if;
 insert into private.patient_document_uploads(clinic_id,patient_id,id,section,category,title,document_date,content_type,size_bytes,sha256_hex,storage_path,created_by) values(p_clinic_id,p_patient_id,p_id,p_section,p_category,p_title,p_document_date,p_content_type,p_size_bytes,p_sha256,p_storage_path,v_uid);
 select jsonb_build_object('id',u.id,'clinic_id',u.clinic_id,'patient_id',u.patient_id,'section',u.section,'category',u.category,'document_type','upload','title',u.title,'document_date',u.document_date,'content_type',u.content_type,'size_bytes',u.size_bytes,'created_at',u.created_at,'created_by',u.created_by,'finalized_at',u.finalized_at,'version',1,'source','upload','status','stored','template_id',null,'template_version',null) into v_item from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.id=p_id;
 insert into private.patient_document_command_receipts(actor_id,request_key,action,clinic_id,patient_id,payload_hash,response) values(v_uid,p_request_key,'upload',p_clinic_id,p_patient_id,v_hash,v_item);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_uid,'patient_document.uploaded',p_id,p_correlation_id);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref) values(p_clinic_id,'PatientDocumentUploaded',1,p_id,p_correlation_id,v_uid);
 return jsonb_build_object('item',v_item,'replayed',false);
end $$;

create function public.read_patient_document_templates(p_clinic_id uuid,p_patient_id uuid,p_type text,p_gate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_items jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 if p_type not in('report','prescription') or not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('dentist','assistant') and (p_type='report' or m.role='dentist')) then raise exception using errcode='42501',message='clinical document scope denied'; end if;
 if not exists(select 1 from public.patients p where p.clinic_id=p_clinic_id and p.id=p_patient_id) then raise exception using errcode='PT404',message='patient unavailable'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,'type',t.document_type,'label',t.label,'initial_content',t.initial_content) order by t.version desc),'[]'::jsonb) into v_items from private.patient_document_templates t where t.clinic_id=p_clinic_id and t.document_type=p_type;
 return jsonb_build_object('schema_version',1,'clinic_id',p_clinic_id,'patient_id',p_patient_id,'items',v_items);
end $$;

create function public.create_patient_document_draft(p_clinic_id uuid,p_patient_id uuid,p_payload jsonb,p_request_key uuid,p_correlation_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_type text:=p_payload->>'type'; v_role_ok boolean; v_hash text; v_prior private.patient_document_command_receipts; v_draft jsonb; v_id uuid;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 select exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((v_type='report' and m.role in('dentist','assistant')) or (v_type='prescription' and m.role='dentist'))) into v_role_ok;
 if not coalesce(v_role_ok,false) then raise exception using errcode='42501',message='clinical document scope denied'; end if;
 if not exists(select 1 from public.patients p where p.clinic_id=p_clinic_id and p.id=p_patient_id) then raise exception using errcode='PT404',message='patient unavailable'; end if;
 if v_type not in('report','prescription') or length(p_payload->>'title') not between 1 and 160 or length(p_payload#>>'{content,body}')>30000 or jsonb_typeof(p_payload->'content')<>'object' then raise exception using errcode='22023',message='invalid clinical draft'; end if;
 if not exists(select 1 from private.patient_document_templates t where t.clinic_id=p_clinic_id and t.id=(p_payload->>'template_id')::uuid and t.version=(p_payload->>'template_version')::integer and t.document_type=v_type) then raise exception using errcode='PT404',message='template unavailable'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('patient_id',p_patient_id,'payload',p_payload)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_key::text,0)); select * into v_prior from private.patient_document_command_receipts r where r.actor_id=v_uid and r.request_key=p_request_key;
 if found then if v_prior.action<>'create_draft' or v_prior.clinic_id<>p_clinic_id or v_prior.patient_id<>p_patient_id or v_prior.payload_hash<>v_hash then raise exception using errcode='PT409',message='idempotency conflict'; end if; return jsonb_build_object('draft',v_prior.response,'replayed',true); end if;
 insert into private.patient_document_drafts(clinic_id,patient_id,document_type,title,document_date,template_id,template_version,content,created_by,updated_by) values(p_clinic_id,p_patient_id,v_type,p_payload->>'title',(p_payload->>'document_date')::date,(p_payload->>'template_id')::uuid,(p_payload->>'template_version')::integer,p_payload->'content',v_uid,v_uid) returning id into v_id;
 insert into private.patient_document_draft_history(clinic_id,patient_id,draft_id,version,title,document_date,content,updated_by) select d.clinic_id,d.patient_id,d.id,d.version,d.title,d.document_date,d.content,d.updated_by from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.id=v_id;
 select jsonb_build_object('id',d.id,'clinic_id',d.clinic_id,'patient_id',d.patient_id,'type',d.document_type,'title',d.title,'document_date',d.document_date,'template_id',d.template_id,'template_version',d.template_version,'content',d.content,'version',d.version,'updated_at',d.updated_at,'updated_by',d.updated_by) into v_draft from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.id=v_id;
 insert into private.patient_document_command_receipts(actor_id,request_key,action,clinic_id,patient_id,payload_hash,response) values(v_uid,p_request_key,'create_draft',p_clinic_id,p_patient_id,v_hash,v_draft);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_uid,'patient_document.draft_created',v_id,p_correlation_id);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref) values(p_clinic_id,'PatientDocumentDraftCreated',1,v_id,p_correlation_id,v_uid);
 return jsonb_build_object('draft',v_draft,'replayed',false);
end $$;

create function public.read_patient_document_draft(p_clinic_id uuid,p_patient_id uuid,p_draft_id uuid,p_gate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_item jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 if not exists(select 1 from public.clinic_memberships m join private.patient_document_drafts d on d.clinic_id=m.clinic_id where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('dentist','assistant') and d.id=p_draft_id and d.patient_id=p_patient_id and (d.document_type<>'prescription' or m.role='dentist')) then raise exception using errcode='42501',message='clinical document scope denied'; end if;
 select jsonb_build_object('id',d.id,'clinic_id',d.clinic_id,'patient_id',d.patient_id,'type',d.document_type,'title',d.title,'document_date',d.document_date,'template_id',d.template_id,'template_version',d.template_version,'content',d.content,'version',d.version,'updated_at',d.updated_at,'updated_by',d.updated_by) into v_item from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.id=p_draft_id and d.status='draft';
 if v_item is null then raise exception using errcode='PT404',message='draft unavailable'; end if; return v_item;
end $$;

create function public.list_patient_document_draft_versions(p_clinic_id uuid,p_patient_id uuid,p_draft_id uuid,p_gate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_items jsonb; v_type text;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 select d.document_type into v_type from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.id=p_draft_id;
 if v_type is null then raise exception using errcode='PT404',message='draft unavailable'; end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((v_type='report' and m.role in('dentist','assistant')) or (v_type='prescription' and m.role='dentist'))) then raise exception using errcode='42501',message='clinical document scope denied'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('version',h.version,'title',h.title,'document_date',h.document_date,'content',h.content,'updated_at',h.updated_at,'updated_by',h.updated_by) order by h.version desc),'[]'::jsonb) into v_items
 from (select * from private.patient_document_draft_history h where h.clinic_id=p_clinic_id and h.patient_id=p_patient_id and h.draft_id=p_draft_id order by h.version desc limit 100) h;
 return jsonb_build_object('schema_version',1,'clinic_id',p_clinic_id,'patient_id',p_patient_id,'draft_id',p_draft_id,'items',v_items);
end $$;

create function public.list_patient_document_drafts(p_clinic_id uuid,p_patient_id uuid,p_type text,p_query text,p_cursor uuid,p_gate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_items jsonb; v_next uuid; v_cursor_updated timestamptz;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 if p_type is not null and p_type not in('report','prescription') or length(coalesce(p_query,''))>100 then raise exception using errcode='22023',message='invalid draft query'; end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('dentist','assistant')) then raise exception using errcode='42501',message='clinical document scope denied'; end if;
 if not exists(select 1 from public.patients p where p.clinic_id=p_clinic_id and p.id=p_patient_id) then raise exception using errcode='PT404',message='patient unavailable'; end if;
 if p_cursor is not null then select d.updated_at into v_cursor_updated from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.id=p_cursor; if v_cursor_updated is null then raise exception using errcode='22023',message='invalid draft cursor'; end if; end if;
 with page as (select d.*,row_number() over(order by d.updated_at desc,d.id desc) rn from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.status='draft' and (p_type is null or d.document_type=p_type) and (p_query is null or strpos(lower(d.title),lower(p_query))>0) and (exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role='dentist') or d.document_type='report') and (p_cursor is null or (d.updated_at,d.id)<(v_cursor_updated,p_cursor)) order by d.updated_at desc,d.id desc limit 11)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'clinic_id',clinic_id,'patient_id',patient_id,'type',document_type,'title',title,'document_date',document_date,'template_id',template_id,'template_version',template_version,'content',content,'version',version,'updated_at',updated_at,'updated_by',updated_by) order by updated_at desc,id desc) filter(where rn<=10),'[]'::jsonb),(select id from page where rn=10 and (select count(*) from page)>10) into v_items,v_next from page;
 return jsonb_build_object('schema_version',1,'clinic_id',p_clinic_id,'patient_id',p_patient_id,'items',v_items,'next_cursor',v_next,'capabilities',jsonb_build_object('can_read_administrative',true,'can_read_clinical',true,'can_read',true,'can_upload',true,'can_upload_administrative',true,'can_upload_clinical',true,'can_create_report',true,'can_create_prescription',exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role='dentist'),'can_edit_draft',true,'can_edit_report',true,'can_edit_prescription',exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role='dentist'),'can_validate',exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role='dentist'),'categories',jsonb_build_array('identity','insurance','cnss','cnops','other','report','prescription','clinical_record','radiograph','clinical_photo','lab_result','care_consent')));
end $$;

create function public.update_patient_document_draft(p_clinic_id uuid,p_patient_id uuid,p_draft_id uuid,p_payload jsonb,p_request_key uuid,p_correlation_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_d private.patient_document_drafts; v_type text; v_hash text; v_prior private.patient_document_command_receipts; v_item jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 select d.document_type into v_type from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.id=p_draft_id;
 if v_type is null then raise exception using errcode='PT404',message='draft unavailable'; end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and ((v_type='report' and m.role in('dentist','assistant')) or (v_type='prescription' and m.role='dentist'))) then raise exception using errcode='42501',message='clinical document scope denied'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('draft_id',p_draft_id,'payload',p_payload)::text,'sha256'),'hex'); perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_key::text,0)); select * into v_prior from private.patient_document_command_receipts r where r.actor_id=v_uid and r.request_key=p_request_key;
 if found then if v_prior.action<>'update_draft' or v_prior.clinic_id<>p_clinic_id or v_prior.patient_id<>p_patient_id or v_prior.payload_hash<>v_hash then raise exception using errcode='PT409',message='idempotency conflict'; end if; return jsonb_build_object('draft',v_prior.response,'replayed',true); end if;
 select * into v_d from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.id=p_draft_id and d.status='draft' for update;
 if not found then raise exception using errcode='PT404',message='draft unavailable'; end if;
 if v_d.version<>(p_payload->>'expected_version')::integer then raise exception using errcode='PT409',message='draft version conflict'; end if;
 if length(p_payload->>'title') not between 1 and 160 or length(p_payload#>>'{content,body}')>30000 then raise exception using errcode='22023',message='invalid draft update'; end if;
 update private.patient_document_drafts set title=p_payload->>'title',document_date=(p_payload->>'document_date')::date,content=p_payload->'content',version=version+1,updated_at=now(),updated_by=v_uid where clinic_id=p_clinic_id and id=p_draft_id;
 insert into private.patient_document_draft_history(clinic_id,patient_id,draft_id,version,title,document_date,content,updated_by) select d.clinic_id,d.patient_id,d.id,d.version,d.title,d.document_date,d.content,d.updated_by from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.id=p_draft_id;
 select jsonb_build_object('id',d.id,'clinic_id',d.clinic_id,'patient_id',d.patient_id,'type',d.document_type,'title',d.title,'document_date',d.document_date,'template_id',d.template_id,'template_version',d.template_version,'content',d.content,'version',d.version,'updated_at',d.updated_at,'updated_by',d.updated_by) into v_item from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.id=p_draft_id;
 insert into private.patient_document_command_receipts(actor_id,request_key,action,clinic_id,patient_id,payload_hash,response) values(v_uid,p_request_key,'update_draft',p_clinic_id,p_patient_id,v_hash,v_item);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_uid,'patient_document.draft_updated',p_draft_id,p_correlation_id);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref) values(p_clinic_id,'PatientDocumentDraftUpdated',1,p_draft_id,p_correlation_id,v_uid);
 return jsonb_build_object('draft',v_item,'replayed',false);
end $$;

create function public.validate_patient_document_draft(p_clinic_id uuid,p_patient_id uuid,p_draft_id uuid,p_expected_version integer,p_request_key uuid,p_correlation_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_d private.patient_document_drafts; v_hash text; v_prior private.patient_document_command_receipts; v_item jsonb; v_id uuid; v_patient_name text; v_patient_reference text; v_clinic_name text; v_validated_name text;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role='dentist') then raise exception using errcode='42501',message='only a dentist may validate clinical documents'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('draft_id',p_draft_id,'expected_version',p_expected_version)::text,'sha256'),'hex'); perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_key::text,0)); select * into v_prior from private.patient_document_command_receipts r where r.actor_id=v_uid and r.request_key=p_request_key;
 if found then if v_prior.action<>'validate_draft' or v_prior.clinic_id<>p_clinic_id or v_prior.patient_id<>p_patient_id or v_prior.payload_hash<>v_hash then raise exception using errcode='PT409',message='idempotency conflict'; end if; return jsonb_build_object('item',v_prior.response,'replayed',true); end if;
 select * into v_d from private.patient_document_drafts d where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.id=p_draft_id and d.status='draft' for update;
 if not found then raise exception using errcode='PT404',message='draft unavailable'; end if;
 if v_d.version<>p_expected_version then raise exception using errcode='PT409',message='draft version conflict'; end if;
 select p.display_name,p.reference,c.name,pr.display_name into v_patient_name,v_patient_reference,v_clinic_name,v_validated_name
 from public.patients p join public.clinics c on c.id=p.clinic_id left join public.profiles pr on pr.user_id=v_uid where p.id=p_patient_id and p.clinic_id=p_clinic_id;
 if v_patient_name is null or v_patient_reference is null or v_clinic_name is null or v_validated_name is null then raise exception using errcode='PT503',message='clinical document context unavailable'; end if;
 insert into private.patient_document_versions(clinic_id,patient_id,draft_id,version,document_type,title,document_date,template_id,template_version,content,patient_name,patient_reference,clinic_name,validated_by_name,validated_at,created_by) values(v_d.clinic_id,v_d.patient_id,v_d.id,v_d.version,v_d.document_type,v_d.title,v_d.document_date,v_d.template_id,v_d.template_version,v_d.content,v_patient_name,v_patient_reference,v_clinic_name,v_validated_name,now(),v_uid) returning id into v_id;
 update private.patient_document_drafts set status='validated',updated_at=now(),updated_by=v_uid where clinic_id=p_clinic_id and id=p_draft_id;
 select jsonb_build_object('id',v.id,'clinic_id',v.clinic_id,'patient_id',v.patient_id,'section','clinical','category',v.document_type,'document_type',v.document_type,'title',v.title,'document_date',v.document_date,'content_type','application/json','size_bytes',octet_length(v.content::text),'created_at',v.finalized_at,'created_by',v.created_by,'finalized_at',v.finalized_at,'version',v.version,'source','generated','status','validated','template_id',v.template_id,'template_version',v.template_version) into v_item from private.patient_document_versions v where v.clinic_id=p_clinic_id and v.id=v_id;
 insert into private.patient_document_command_receipts(actor_id,request_key,action,clinic_id,patient_id,payload_hash,response) values(v_uid,p_request_key,'validate_draft',p_clinic_id,p_patient_id,v_hash,v_item);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_uid,'patient_document.validated',v_id,p_correlation_id);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_id,correlation_id,actor_ref) values(p_clinic_id,'PatientDocumentValidated',1,v_id,p_correlation_id,v_uid);
 return jsonb_build_object('item',v_item,'replayed',false);
end $$;

create function public.read_patient_document_content(p_clinic_id uuid,p_patient_id uuid,p_document_id uuid,p_gate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_item jsonb;
begin
 if not private.patient_documents_gate_valid(p_gate) then raise exception using errcode='PT503',message='documents disabled'; end if;
 if exists(select 1 from private.patient_document_uploads u join public.clinic_memberships m on m.clinic_id=u.clinic_id and m.user_id=v_uid and m.active where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.id=p_document_id and ((u.section='administrative' and m.role in('manager','reception','assistant','dentist')) or (u.section='clinical' and m.role in('dentist','assistant','manager')))) then
  select jsonb_build_object('kind','upload','clinic_id',u.clinic_id,'patient_id',u.patient_id,'document_id',u.id,'content_type',u.content_type,'size_bytes',u.size_bytes,'sha256',u.sha256_hex,'storage_path',u.storage_path,'title',u.title,'document_date',u.document_date) into v_item from private.patient_document_uploads u where u.clinic_id=p_clinic_id and u.patient_id=p_patient_id and u.id=p_document_id;
  return v_item;
 end if;
 if not exists(select 1 from public.clinic_memberships m where m.user_id=v_uid and m.clinic_id=p_clinic_id and m.active and m.role in('dentist','assistant')) then raise exception using errcode='42501',message='document scope denied'; end if;
 select jsonb_build_object('kind','generated','clinic_id',v.clinic_id,'patient_id',v.patient_id,'document_id',v.id,'title',v.title,'document_date',v.document_date,'type',v.document_type,'content',v.content,'template_id',v.template_id,'template_version',v.template_version,'version',v.version,'patient_name',v.patient_name,'patient_reference',v.patient_reference,'clinic_name',v.clinic_name,'validated_by_name',v.validated_by_name,'validated_at',v.validated_at) into v_item from private.patient_document_versions v where v.clinic_id=p_clinic_id and v.patient_id=p_patient_id and v.id=p_document_id;
 if v_item is null then raise exception using errcode='PT404',message='document unavailable'; end if; return v_item;
end $$;

revoke all on function public.list_patient_documents(uuid,uuid,text,text,text,integer,text),
 public.register_patient_document_upload(uuid,uuid,uuid,text,text,text,date,text,integer,text,text,uuid,uuid,text),
 public.read_patient_document_templates(uuid,uuid,text,text),public.create_patient_document_draft(uuid,uuid,jsonb,uuid,uuid,text),
 public.read_patient_document_draft(uuid,uuid,uuid,text),public.list_patient_document_drafts(uuid,uuid,text,text,uuid,text),
 public.list_patient_document_draft_versions(uuid,uuid,uuid,text),
 public.update_patient_document_draft(uuid,uuid,uuid,jsonb,uuid,uuid,text),public.validate_patient_document_draft(uuid,uuid,uuid,integer,uuid,uuid,text),
 public.read_patient_document_content(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.list_patient_documents(uuid,uuid,text,text,text,integer,text),
 public.register_patient_document_upload(uuid,uuid,uuid,text,text,text,date,text,integer,text,text,uuid,uuid,text),
 public.read_patient_document_templates(uuid,uuid,text,text),public.create_patient_document_draft(uuid,uuid,jsonb,uuid,uuid,text),
 public.read_patient_document_draft(uuid,uuid,uuid,text),public.list_patient_document_drafts(uuid,uuid,text,text,uuid,text),
 public.list_patient_document_draft_versions(uuid,uuid,uuid,text),
 public.update_patient_document_draft(uuid,uuid,uuid,jsonb,uuid,uuid,text),public.validate_patient_document_draft(uuid,uuid,uuid,integer,uuid,uuid,text),
 public.read_patient_document_content(uuid,uuid,uuid,text) to authenticated;

-- Direct Storage API access stays denied: no storage.objects policies are
-- created. The Nest server proxies authenticated content after metadata checks.
update storage.buckets set public=false,file_size_limit=20971520,
 allowed_mime_types=array['application/pdf','image/jpeg','image/png']
 where id='patient-documents';
