
-- Clinic-only manual checklist metadata. This deliberately stores no files, notes,
-- eligibility decisions, reimbursement estimates, or patient-facing publication.
create table private.patient_admin_document_checklist_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.patient_admin_document_checklist_settings(singleton, enabled)
values (true, false);

create table private.patient_admin_document_checklist (
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null,
  kind text not null check (kind in ('cnss', 'cnops')),
  status text,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz,
  updated_by uuid references auth.users(id),
  primary key (clinic_id, patient_id, kind),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id),
  check (
    (revision = 0 and status is null and updated_at is null and updated_by is null)
    or
    (revision > 0 and status in ('not_applicable', 'missing', 'received', 'needs_correction', 'completed_manually') and updated_at is not null and updated_by is not null)
  )
);

create table private.patient_admin_document_checklist_receipts (
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null,
  actor_id uuid not null references auth.users(id),
  request_key uuid not null,
  normalized_payload jsonb not null,
  item jsonb not null,
  created_at timestamptz not null,
  primary key (clinic_id, actor_id, request_key),
  foreign key (clinic_id, patient_id) references public.patients(clinic_id, id)
);

alter table private.patient_admin_document_checklist_settings enable row level security;
alter table private.patient_admin_document_checklist enable row level security;
alter table private.patient_admin_document_checklist_receipts enable row level security;
revoke all on private.patient_admin_document_checklist_settings,
  private.patient_admin_document_checklist,
  private.patient_admin_document_checklist_receipts
from public, anon, authenticated, service_role;

create function public.list_patient_admin_document_checklist(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_correlation_id uuid
) returns jsonb
language plpgsql security definer
set search_path = '' set timezone = 'UTC' as $$
declare
  v_actor uuid := auth.uid();
  v_items jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_clinic_id is null or p_patient_id is null or p_correlation_id is null
    or coalesce(current_setting('request.method', true), '') <> 'POST' then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;

  perform 1 from public.clinic_memberships m
  where m.clinic_id = p_clinic_id and m.user_id = v_actor and m.active
    and m.role in ('reception', 'manager', 'dentist')
  for share;
  if not found then raise exception using errcode = '42501', message = 'Checklist unavailable'; end if;
  perform 1 from public.patients p where p.clinic_id = p_clinic_id and p.id = p_patient_id;
  if not found then raise exception using errcode = 'PT404', message = 'Checklist unavailable'; end if;
  if not exists (select 1 from private.patient_admin_document_checklist_settings s where s.singleton and s.enabled) then
    raise exception using errcode = 'PT503', message = 'Checklist disabled';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'clinic_id', c.clinic_id,
    'patient_id', c.patient_id,
    'kind', c.kind,
    'status', c.status,
    'revision', c.revision,
    'updated_at', to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_by', c.updated_by
  ) order by c.kind), '[]'::jsonb)
  into v_items
  from private.patient_admin_document_checklist c
  where c.clinic_id = p_clinic_id and c.patient_id = p_patient_id and c.revision > 0;

  insert into private.audit_events(clinic_id, actor_ref, action, aggregate_id, correlation_id, occurred_at)
  values (p_clinic_id, v_actor, 'PatientAdminDocumentChecklistViewed', p_patient_id, p_correlation_id, v_now);
  insert into private.outbox_events(clinic_id, event_type, event_version, aggregate_type, aggregate_id, correlation_id, actor_ref, occurred_at, payload)
  values (p_clinic_id, 'PatientAdminDocumentChecklistViewed', 1, 'patient', p_patient_id, p_correlation_id, v_actor, v_now,
    jsonb_build_object('access_scope', 'clinic_admin_document_checklist'));

  return jsonb_build_object('schema_version', 1, 'clinic_id', p_clinic_id, 'patient_id', p_patient_id, 'items', v_items);
end $$;

create function public.set_patient_admin_document_checklist(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_payload jsonb,
  p_request_key uuid,
  p_correlation_id uuid
) returns jsonb
language plpgsql security definer
set search_path = '' set timezone = 'UTC' as $$
declare
  v_actor uuid := auth.uid();
  v_expected numeric;
  v_kind text;
  v_status text;
  v_normalized jsonb;
  v_prior private.patient_admin_document_checklist_receipts;
  v_state private.patient_admin_document_checklist;
  v_item jsonb;
  v_now timestamptz;
  v_changed boolean;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_clinic_id is null or p_patient_id is null or p_request_key is null or p_correlation_id is null
    or coalesce(current_setting('request.method', true), '') <> 'POST' then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;

  perform 1 from public.clinic_memberships m
  where m.clinic_id = p_clinic_id and m.user_id = v_actor and m.active
    and m.role in ('reception', 'manager', 'dentist')
  for share;
  if not found then raise exception using errcode = '42501', message = 'Checklist unavailable'; end if;
  perform 1 from public.patients p where p.clinic_id = p_clinic_id and p.id = p_patient_id;
  if not found then raise exception using errcode = 'PT404', message = 'Checklist unavailable'; end if;
  if not exists (select 1 from private.patient_admin_document_checklist_settings s where s.singleton and s.enabled) then
    raise exception using errcode = 'PT503', message = 'Checklist disabled';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or not (p_payload ?& array['expected_revision', 'kind', 'status'])
    or (select count(*) from jsonb_object_keys(p_payload)) <> 3
    or jsonb_typeof(p_payload->'expected_revision') <> 'number'
    or jsonb_typeof(p_payload->'kind') <> 'string'
    or jsonb_typeof(p_payload->'status') <> 'string' then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;
  v_expected := (p_payload->>'expected_revision')::numeric;
  v_kind := p_payload->>'kind';
  v_status := p_payload->>'status';
  if v_expected < 0 or v_expected > 2147483646 or v_expected <> trunc(v_expected)
    or v_kind not in ('cnss', 'cnops')
    or v_status not in ('not_applicable', 'missing', 'received', 'needs_correction', 'completed_manually') then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;
  v_normalized := jsonb_build_object('expected_revision', v_expected::integer, 'kind', v_kind, 'status', v_status);

  insert into private.patient_admin_document_checklist(clinic_id, patient_id, kind, status, revision)
  values (p_clinic_id, p_patient_id, v_kind, null, 0)
  on conflict (clinic_id, patient_id, kind) do nothing;
  select * into v_state from private.patient_admin_document_checklist c
  where c.clinic_id = p_clinic_id and c.patient_id = p_patient_id and c.kind = v_kind
  for update;

  select * into v_prior from private.patient_admin_document_checklist_receipts r
  where r.clinic_id = p_clinic_id and r.actor_id = v_actor and r.request_key = p_request_key;
  if found then
    if v_prior.patient_id <> p_patient_id or v_prior.normalized_payload <> v_normalized then
      raise exception using errcode = 'PT409', message = 'Checklist command conflict';
    end if;
    return jsonb_build_object('item', v_prior.item, 'replayed', true);
  end if;
  if v_state.revision <> v_expected then raise exception using errcode = 'PT409', message = 'Checklist changed'; end if;

  v_changed := v_state.status is distinct from v_status;
  v_now := clock_timestamp();
  if v_changed then
    update private.patient_admin_document_checklist
    set status = v_status, revision = v_state.revision + 1, updated_at = v_now, updated_by = v_actor
    where clinic_id = p_clinic_id and patient_id = p_patient_id and kind = v_kind
    returning * into v_state;
  end if;
  v_item := jsonb_build_object(
    'clinic_id', p_clinic_id,
    'patient_id', p_patient_id,
    'kind', v_state.kind,
    'status', v_state.status,
    'revision', v_state.revision,
    'updated_at', to_char(v_state.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_by', v_state.updated_by
  );
  insert into private.patient_admin_document_checklist_receipts(clinic_id, patient_id, actor_id, request_key, normalized_payload, item, created_at)
  values (p_clinic_id, p_patient_id, v_actor, p_request_key, v_normalized, v_item, v_now);

  if v_changed then
    insert into private.audit_events(clinic_id, actor_ref, action, aggregate_id, correlation_id, occurred_at)
    values (p_clinic_id, v_actor, 'PatientAdminDocumentChecklistChanged', p_patient_id, p_correlation_id, v_now);
    insert into private.outbox_events(clinic_id, event_type, event_version, aggregate_type, aggregate_id, correlation_id, actor_ref, occurred_at, payload)
    values (p_clinic_id, 'PatientAdminDocumentChecklistChanged', 1, 'patient', p_patient_id, p_correlation_id, v_actor, v_now,
      jsonb_build_object('kind', v_kind, 'status', v_status, 'revision', v_state.revision));
  end if;
  return jsonb_build_object('item', v_item, 'replayed', false);
end $$;

create function private.reject_patient_admin_checklist_receipt_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'Checklist receipts are immutable';
end $$;
create trigger patient_admin_checklist_receipts_immutable
before update or delete on private.patient_admin_document_checklist_receipts
for each row execute function private.reject_patient_admin_checklist_receipt_mutation();

revoke all on function public.list_patient_admin_document_checklist(uuid, uuid, uuid),
  public.set_patient_admin_document_checklist(uuid, uuid, jsonb, uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.list_patient_admin_document_checklist(uuid, uuid, uuid),
  public.set_patient_admin_document_checklist(uuid, uuid, jsonb, uuid, uuid)
to authenticated;
