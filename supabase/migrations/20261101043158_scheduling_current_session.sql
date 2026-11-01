-- Enforce current session ownership and expiry for every scheduling hold entry point.
create or replace function private.require_scheduling(p_clinic uuid) returns uuid language plpgsql set search_path='' as $$
declare v_actor uuid:=private.require_current_session();
begin
  if v_actor is null then raise exception using errcode='28000',message='unauthenticated';end if;
  if p_clinic is null or not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic and user_id=v_actor and active and role in ('reception','manager','dentist')) then raise exception using errcode='42501',message='forbidden';end if;
  if not exists(select 1 from private.scheduling_settings where clinic_id=p_clinic and enabled and synthetic_only) then raise exception using errcode='PT503',message='scheduling_disabled';end if;
  if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='invalid_request';end if;
  return v_actor;
end $$;
revoke all on function private.require_scheduling(uuid) from public,anon,authenticated;
