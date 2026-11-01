begin;

-- Keep the existing RPC signature intact for already generated local clients.
-- Search uses a distinct function name because Supabase RPC does not support
-- overloaded function resolution reliably.
create function public.read_local_installment_reminder_queue_search(
  p_clinic_id uuid,
  p_after_due date,
  p_after_id uuid,
  p_query text,
  p_gate text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (clock_timestamp() at time zone 'Africa/Casablanca')::date;
  v_items jsonb := '[]'::jsonb;
  v_row record;
  v_balances jsonb;
  v_count integer := 0;
  v_more boolean := false;
  v_last_due date;
  v_last_id uuid;
  v_query text := nullif(btrim(p_query), '');
begin
  perform private.authorize_local_quote_draft(p_clinic_id, p_gate);
  if (p_after_due is null) <> (p_after_id is null)
    or p_after_due < '2000-01-01'::date
    or p_after_due > '2100-12-31'::date
    or (v_query is not null and char_length(v_query) > 100) then
    raise exception using errcode = '22023', message = 'invalid_queue_query';
  end if;

  for v_row in
    select
      l.id,
      l.plan_id,
      l.version,
      l.invoice_id,
      l.due_on,
      l.amount_minor,
      p.patient_id,
      pt.display_name,
      pt.reference,
      private.installment_line_paid(p_clinic_id, l.id) as paid
    from private.finance_installment_lines l
    join private.finance_installment_plans p
      on p.clinic_id = l.clinic_id
      and p.id = l.plan_id
      and p.accepted_version = l.version
    join public.patients pt
      on pt.clinic_id = p.clinic_id
      and pt.id = p.patient_id
    where l.clinic_id = p_clinic_id
      and l.due_on <= v_today
      and (p_after_id is null or (l.due_on, l.id) > (p_after_due, p_after_id))
      and l.amount_minor > private.installment_line_paid(p_clinic_id, l.id)
      and (
        v_query is null
        or strpos(lower(pt.display_name), lower(v_query)) > 0
        or strpos(lower(pt.reference), lower(v_query)) > 0
      )
    order by l.due_on, l.id
    limit 11
  loop
    v_count := v_count + 1;
    if v_count > 10 then
      v_more := true;
      exit;
    end if;

    v_balances := public.read_local_installment_balances(
      p_clinic_id,
      v_row.patient_id,
      v_row.plan_id,
      v_row.version,
      p_gate
    );
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'line_id', v_row.id,
      'plan_id', v_row.plan_id,
      'version', v_row.version,
      'invoice_id', v_row.invoice_id,
      'patient_id', v_row.patient_id,
      'patient_name', v_row.display_name,
      'patient_reference', v_row.reference,
      'due_on', to_char(v_row.due_on, 'YYYY-MM-DD'),
      'amount_minor', v_row.amount_minor,
      'paid_minor', v_row.paid,
      'remaining_minor', v_row.amount_minor - v_row.paid,
      'overdue', v_row.due_on < v_today,
      'requires_revision', (v_balances->>'requires_revision')::boolean
    ));
    v_last_due := v_row.due_on;
    v_last_id := v_row.id;
  end loop;

  return jsonb_build_object(
    'clinic_id', p_clinic_id,
    'synthetic_only', true,
    'as_of_date', to_char(v_today, 'YYYY-MM-DD'),
    'time_zone', 'Africa/Casablanca',
    'currency_code', 'MAD',
    'items', v_items,
    'next_cursor', case
      when v_more then jsonb_build_object('due_on', to_char(v_last_due, 'YYYY-MM-DD'), 'line_id', v_last_id)
      else null
    end
  );
end
$$;

revoke all on function public.read_local_installment_reminder_queue_search(uuid, date, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_local_installment_reminder_queue_search(uuid, date, uuid, text, text)
  to authenticated;
comment on function public.read_local_installment_reminder_queue_search(uuid, date, uuid, text, text)
  is 'Local synthetic manager reminder review queue with literal patient name/reference search. Read only; no message is prepared or sent.';

commit;
