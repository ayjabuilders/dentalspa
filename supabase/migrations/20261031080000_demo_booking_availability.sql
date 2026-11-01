-- Public projection for the existing local synthetic booking lane only.
-- No request, patient, appointment ID, contact or occupancy reason is returned.
create function public.list_demo_booking_availability(p_date date, p_gate_key text)
returns table (starts_at timestamptz, ends_at timestamptz, resource_pair text)
language plpgsql stable security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_today date := (statement_timestamp() at time zone 'Africa/Casablanca')::date;
begin
  if not exists (select 1 from private.demo_booking_confirmation_settings s
    where s.singleton and s.enabled and s.api_gate_key <> '' and s.api_gate_key = p_gate_key) then
    raise exception using errcode = 'PT503', message = 'demo_confirmation_disabled';
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + 90 then
    raise exception using errcode = '22023', message = 'invalid_date';
  end if;
  return query
  with pairs(pair, provider, chair) as (values
    ('a'::text, '73000000-0000-4000-8000-000000000001'::uuid, '73000000-0000-4000-8000-000000000003'::uuid),
    ('b'::text, '73000000-0000-4000-8000-000000000002'::uuid, '73000000-0000-4000-8000-000000000004'::uuid)
  ), slots as (
    select (p_date + time '09:00' + n * interval '15 minutes') at time zone 'Africa/Casablanca' as slot_start,
      (p_date + time '09:00' + n * interval '15 minutes' + interval '45 minutes') at time zone 'Africa/Casablanca' as slot_end,
      p_date + time '09:00' + n * interval '15 minutes' as local_start
    from generate_series(0, 33) n
    where extract(isodow from p_date) <= 6
  )
  select s.slot_start, s.slot_end, p.pair
  from slots s cross join pairs p
  where s.slot_start > statement_timestamp()
    and ((s.local_start::time >= time '09:00' and (s.local_start + interval '45 minutes')::time <= time '12:00')
      or (s.local_start::time >= time '14:00' and (s.local_start + interval '45 minutes')::time <= time '18:00'))
    and exists (select 1 from private.demo_booking_sample_resources r where r.id = p.provider
      and r.clinic_id = '10000000-0000-4000-8000-000000000001'::uuid and r.active and r.kind = 'provider')
    and exists (select 1 from private.demo_booking_sample_resources r where r.id = p.chair
      and r.clinic_id = '10000000-0000-4000-8000-000000000001'::uuid and r.active and r.kind = 'chair')
    and not exists (select 1 from private.demo_confirmed_appointments a
      where a.clinic_id = '10000000-0000-4000-8000-000000000001'::uuid
        and a.status = 'confirmed' and (a.provider_resource_id = p.provider or a.chair_resource_id = p.chair)
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(s.slot_start, s.slot_end, '[)'))
  order by s.slot_start, p.pair;
end
$$;
revoke all on function public.list_demo_booking_availability(date,text) from public, anon, authenticated;
grant execute on function public.list_demo_booking_availability(date,text) to anon;
