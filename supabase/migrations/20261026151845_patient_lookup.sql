-- M02.2 read-only lookup. No patient selection, creation, merge or account link.
-- SECURITY INVOKER preserves foundation RLS in addition to explicit scope checks.
create function public.lookup_patients(p_clinic_id uuid,p_request jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_mode text;
  v_query text;
  v_items jsonb;
  v_count integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required'; end if;
  if p_clinic_id is null or not exists(select 1 from public.clinic_memberships m
    where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.active and m.role in ('reception','manager','dentist'))
  then raise exception using errcode='42501',message='Patient lookup scope denied'; end if;
  -- Also deny URL-encoded RPC GETs. Authorized direct SQL tests explicitly set
  -- the request method, as PostgREST does for JSON-body RPC calls.
  if coalesce(current_setting('request.method',true),'') <> 'POST' then
    raise exception using errcode='22023',message='JSON POST required';
  end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' then
    raise exception using errcode='22023',message='Invalid patient lookup input';
  end if;
  if not (p_request ?& array['mode','query']) or (select count(*) from jsonb_object_keys(p_request))<>2
    or jsonb_typeof(p_request->'mode')<>'string' or jsonb_typeof(p_request->'query')<>'string' then
    raise exception using errcode='22023',message='Invalid patient lookup input';
  end if;
  v_mode:=p_request->>'mode';
  v_query:=btrim(p_request->>'query',E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279));
  if v_mode not in ('reference_exact','name_prefix')
    or (v_mode='reference_exact' and char_length(v_query) not between 1 and 256)
    or (v_mode='name_prefix' and char_length(v_query) not between 2 and 120) then
    raise exception using errcode='22023',message='Invalid patient lookup input';
  end if;
  with matched as (
    select p.id,p.clinic_id,p.reference,p.display_name,v_mode as match_basis
    from public.patients p where p.clinic_id=p_clinic_id and
      ((v_mode='reference_exact' and p.reference collate "C"=v_query collate "C")
       or (v_mode='name_prefix' and left(p.display_name,char_length(v_query)) collate "C"=v_query collate "C"))
    order by p.reference collate "C" asc,p.id asc limit 21
  ), numbered as (
    select matched.*,row_number() over(order by reference collate "C" asc,id asc) as row_number from matched
  )
  select coalesce(jsonb_agg(to_jsonb(numbered)-'row_number' order by reference collate "C" asc,id asc) filter(where row_number<=20),'[]'::jsonb),count(*)
    into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>20);
end $$;
revoke all on function public.lookup_patients(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lookup_patients(uuid,jsonb) to authenticated;
