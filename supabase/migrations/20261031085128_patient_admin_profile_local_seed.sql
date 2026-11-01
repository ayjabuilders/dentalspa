-- Administrative demographics and explicit synthetic appointment linkage.
-- No clinical facts, patient account linkage, messaging or payment execution.
create table private.patient_admin_profiles (
  clinic_id uuid not null,
  patient_id uuid not null,
  phone_display text check(char_length(phone_display)<=40),
  email text check(char_length(email)<=254),
  city text check(char_length(city)<=100),
  birth_date date,
  preferred_language text not null default 'fr' check(preferred_language in ('fr','ar','en')),
  revision integer not null default 1 check(revision>0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,patient_id),
  foreign key(clinic_id,patient_id) references public.patients(clinic_id,id)
);
alter table private.patient_admin_profiles enable row level security;
revoke all on private.patient_admin_profiles from public,anon,authenticated,service_role;
alter table private.demo_confirmed_appointments add column patient_id uuid;
alter table private.demo_confirmed_appointments add constraint demo_appointment_patient_scope
  foreign key(clinic_id,patient_id) references public.patients(clinic_id,id);
create index demo_appointments_patient on private.demo_confirmed_appointments(clinic_id,patient_id,starts_at) where patient_id is not null;

create function public.read_patient_hub(p_clinic_id uuid,p_patient_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='unauthenticated'; end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=auth.uid() and active and role in ('reception','manager','dentist')) then
    raise exception using errcode='42501',message='forbidden';
  end if;
  select jsonb_build_object(
    'patient',jsonb_build_object('id',p.id,'clinic_id',p.clinic_id,'reference',p.reference,'display_name',p.display_name),
    'profile',(select jsonb_build_object('phone_display',a.phone_display,'email',a.email,'city',a.city,'birth_date',a.birth_date,'preferred_language',a.preferred_language,'revision',a.revision) from private.patient_admin_profiles a where a.clinic_id=p.clinic_id and a.patient_id=p.id),
    'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'starts_at',to_char(a.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'ends_at',to_char(a.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status',a.status) order by a.starts_at)
      from private.demo_confirmed_appointments a where a.clinic_id=p.clinic_id and a.patient_id=p.id),'[]'::jsonb),
    'checklist',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'status',c.status,'revision',c.revision) order by c.kind) from private.patient_admin_document_checklist c where c.clinic_id=p.clinic_id and c.patient_id=p.id),'[]'::jsonb),
    'quotes',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'version',v.version,'state',v.state,'currency_code',v.currency_code,'total_minor',v.total_minor) order by q.created_at)
      from private.finance_quotes q join private.finance_quote_versions v on v.clinic_id=q.clinic_id and v.quote_id=q.id
      where q.clinic_id=p.clinic_id and q.patient_id=p.id and v.version=(select max(v2.version) from private.finance_quote_versions v2 where v2.clinic_id=q.clinic_id and v2.quote_id=q.id)),'[]'::jsonb)
  ) into v_result from public.patients p where p.clinic_id=p_clinic_id and p.id=p_patient_id;
  if v_result is null then raise exception using errcode='PT404',message='patient_unavailable'; end if;
  return v_result;
end $$;
revoke all on function public.read_patient_hub(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_patient_hub(uuid,uuid) to authenticated;
