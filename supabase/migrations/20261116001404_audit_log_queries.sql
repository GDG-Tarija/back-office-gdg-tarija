-- Consulta de la auditoría para la pantalla Actividad y los historiales (solo SUPERADMIN).
--
-- list_audit_log() filtra por evento, persona que actuó, categoría, inscripción y fechas, pagina en
-- el servidor y devuelve cada fila con nombres legibles: quién actuó, el evento y sobre qué/quién
-- fue (la persona inscrita, el paquete, el cupón, el correo con acceso...). Si la fila original ya
-- no existe (se borró), se usa lo que guardó la auditoría.

create index if not exists audit_log_registration_ref_idx
  on public.audit_log ((changes ->> 'registration_id'))
  where table_name in ('scan_logs', 'session_registrations');

create or replace function public.list_audit_log(
  p_event_id        uuid        default null,
  p_actor_id        uuid        default null,
  p_category        text        default null,
  p_registration_id uuid        default null,
  p_from            timestamptz default null,
  p_to              timestamptz default null,
  p_limit           integer     default 50,
  p_offset          integer     default 0
)
returns table (
  id           bigint,
  occurred_at  timestamptz,
  actor_id     uuid,
  actor_email  text,
  actor_role   text,
  actor_name   text,
  action       text,
  table_name   text,
  record_id    text,
  event_id     uuid,
  event_title  text,
  subject_name text,
  changes      jsonb,
  source       text,
  total_count  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tables text[] := case p_category
    when 'ACCESS'        then array['staff_whitelist', 'event_staff_assignments']
    when 'CONFIG'        then array['events', 'ticket_types', 'ticket_phases', 'event_coupons', 'tracks', 'sessions']
    when 'REGISTRATIONS' then array['registrations', 'session_registrations']
    when 'CHECKIN'       then array['scan_logs']
    else null
  end;
begin
  perform public.require_superadmin();

  if p_category is not null and v_tables is null then
    raise exception 'Categoría no válida.' using errcode = 'P0020';
  end if;

  return query
  with filtered as (
    select a.*
    from public.audit_log a
    where (p_event_id is null or a.event_id = p_event_id)
      and (p_actor_id is null or a.actor_id = p_actor_id)
      and (v_tables is null or a.table_name = any (v_tables))
      and (p_from is null or a.occurred_at >= p_from)
      and (p_to is null or a.occurred_at < p_to)
      and (
        p_registration_id is null
        or (a.table_name = 'registrations' and a.record_id = p_registration_id::text)
        or (a.table_name in ('scan_logs', 'session_registrations')
            and a.changes ->> 'registration_id' = p_registration_id::text)
      )
  ),
  page as (
    select f.*, count(*) over () as total
    from filtered f
    order by f.occurred_at desc, f.id desc
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    p.id,
    p.occurred_at,
    p.actor_id,
    p.actor_email,
    p.actor_role,
    nullif(trim(concat_ws(' ', au_user.first_name, au_user.last_name)), '')::text,
    p.action,
    p.table_name,
    p.record_id,
    p.event_id,
    coalesce(ev.title, case when p.table_name = 'events' then p.changes ->> 'title' end)::text,
    (case
      when p.table_name in ('registrations', 'scan_logs', 'session_registrations') then
        coalesce(
          nullif(trim(concat_ws(' ', reg_user.first_name, reg_user.last_name)), ''),
          reg_user.email
        )
      when p.table_name = 'staff_whitelist' then coalesce(p.changes ->> 'email', sw.email)
      when p.table_name = 'event_staff_assignments' then coalesce(p.changes ->> 'staff_email', esa.staff_email)
      when p.table_name = 'events' then coalesce(ev.title, p.changes ->> 'title')
      when p.table_name = 'ticket_types' then coalesce(tt.name, p.changes ->> 'name')
      when p.table_name = 'ticket_phases' then coalesce(tp.name, p.changes ->> 'name')
      when p.table_name = 'event_coupons' then coalesce(cp.code, p.changes ->> 'code')
      when p.table_name = 'tracks' then coalesce(tr.nombre, p.changes ->> 'nombre')
      when p.table_name = 'sessions' then coalesce(se.title, p.changes ->> 'title')
    end)::text,
    p.changes,
    p.source,
    p.total
  from page p
  left join public.users au_user on au_user.id = p.actor_id
  left join public.events ev on ev.id = p.event_id
  left join public.registrations reg
    on p.table_name in ('registrations', 'scan_logs', 'session_registrations')
   and reg.id::text = case
         when p.table_name = 'registrations' then p.record_id
         else coalesce(p.changes ->> 'registration_id', p.record_id)
       end
  left join public.users reg_user
    on reg_user.id = coalesce(reg.user_id, nullif(p.changes ->> 'user_id', '')::uuid)
  left join public.staff_whitelist sw on p.table_name = 'staff_whitelist' and sw.id::text = p.record_id
  left join public.event_staff_assignments esa on p.table_name = 'event_staff_assignments' and esa.id::text = p.record_id
  left join public.ticket_types tt on p.table_name = 'ticket_types' and tt.id::text = p.record_id
  left join public.ticket_phases tp on p.table_name = 'ticket_phases' and tp.id::text = p.record_id
  left join public.event_coupons cp on p.table_name = 'event_coupons' and cp.id::text = p.record_id
  left join public.tracks tr on p.table_name = 'tracks' and tr.id::text = p.record_id
  left join public.sessions se on p.table_name = 'sessions' and se.id::text = p.record_id
  order by p.occurred_at desc, p.id desc;
end;
$$;

revoke all on function public.list_audit_log(uuid, uuid, text, uuid, timestamptz, timestamptz, integer, integer)
  from public, anon;
grant execute on function public.list_audit_log(uuid, uuid, text, uuid, timestamptz, timestamptz, integer, integer)
  to authenticated;
