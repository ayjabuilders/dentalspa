-- Kept private: callers use scoped RPCs; session rows never leave the database.
create function private.require_current_session() returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  perform 1 from auth.sessions s where s.user_id=v_actor
    and s.id::text=auth.jwt()->>'session_id'
    and (s.not_after is null or s.not_after>clock_timestamp()) for share;
  if not found then raise exception using errcode='28000',message='Authentication required';end if;
  return v_actor;
end $$;
revoke all on function private.require_current_session() from public,anon,authenticated;

create or replace function private.require_intake_staff(p_clinic_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=private.require_current_session();
begin
  if p_clinic_id is null or not exists(select 1 from public.clinic_memberships m
    where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.active and m.role in ('reception','manager','dentist'))
  then raise exception using errcode='42501',message='Intake scope denied';end if;
  return v_actor;
end $$;
revoke all on function private.require_intake_staff(uuid) from public,anon,authenticated;

create or replace function private.lock_intake_outcome_staff(p_clinic_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=private.require_current_session();
begin
  perform 1 from public.clinic_memberships m
    where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.active and m.role in ('reception','manager','dentist') for share;
  if not found then raise exception using errcode='42501',message='Contact outcome scope denied';end if;
  return v_actor;
end $$;
revoke all on function private.lock_intake_outcome_staff(uuid) from public,anon,authenticated;
