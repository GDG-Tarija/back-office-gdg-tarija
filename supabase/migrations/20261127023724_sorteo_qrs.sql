-- QRs del sorteo: un QR con nombre (la mesa de una comunidad, un momento de una charla, un link al
-- grupo) que los asistentes escanean con su cuenta para sumar 1 ticket. Hasta ahora solo sumaba
-- quien era escaneado por un speaker, sponsor o staff.
--
-- El ticket es el mismo `pts:<actividad>` de siempre: el conteo (`raffle_tickets`) y el sorteo no
-- cambian. No cambia datos.

-- 1. Actividades editables desde el back-office ---------------------------------------------------
-- Antes se cargaban por SQL. La lectura sigue abierta a `authenticated`.

create policy superadmin_insert_point_activities on public.point_activities
  for insert to authenticated
  with check (public.is_superadmin());
create policy superadmin_update_point_activities on public.point_activities
  for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
create policy superadmin_delete_point_activities on public.point_activities
  for delete to authenticated
  using (public.is_superadmin());

-- 2. El código del QR -----------------------------------------------------------------------------
-- Va en su propia tabla porque `point_activities` la lee cualquier persona con sesión: si el código
-- viviera ahí, se podría sumar el ticket sin pasar por la mesa. `id` es lo que lleva el QR.

create table public.point_activity_qrs (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.point_activities (id) on delete cascade,
  -- Apagado: el QR deja de sumar, pero los tickets que ya dio se conservan.
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.point_activity_qrs is
  'QR de una actividad del sorteo: el asistente lo escanea y claim_qr_ticket() le suma el ticket pts:<activity_id>. El id es el secreto del QR.';

-- Sin auditoría a propósito: el registro guardaría el código, y crear o borrar la actividad ya
-- queda auditado en point_activities.
create trigger trg_set_updated_at before update on public.point_activity_qrs
  for each row execute function public.set_updated_at();

alter table public.point_activity_qrs enable row level security;

create policy superadmin_all_point_activity_qrs on public.point_activity_qrs
  for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- 3. Sumar el ticket escaneando el QR -------------------------------------------------------------

create or replace function public.claim_qr_ticket(p_event_id uuid, p_code uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity public.point_activities%rowtype;
  v_mine     uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para escanear.' using errcode = '42501';
  end if;

  -- Un QR apagado, borrado o de otro evento responde igual que uno que no existe.
  select a.* into v_activity
  from public.point_activity_qrs q
  join public.point_activities a on a.id = q.activity_id
  where q.id = p_code and q.active and a.event_id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select id into v_mine
  from public.registrations
  where event_id = p_event_id and user_id = auth.uid() and status = 'CONFIRMED';
  if not found then
    return jsonb_build_object('status', 'not_registered', 'name', v_activity.name);
  end if;

  -- Misma regla que scan_ticket: sin check-in no hay ticket.
  if not exists (
    select 1 from public.scan_logs where registration_id = v_mine and scan_type = 'checkin'
  ) then
    return jsonb_build_object('status', 'not_checked_in', 'name', v_activity.name);
  end if;

  insert into public.scan_logs (registration_id, scan_type, scanned_by)
  values (v_mine, 'pts:' || v_activity.id, auth.uid())
  on conflict (registration_id, scan_type) do nothing;

  return jsonb_build_object('status', case when found then 'ok' else 'already' end, 'name', v_activity.name);
end;
$$;

revoke all on function public.claim_qr_ticket(uuid, uuid) from public, anon;
grant execute on function public.claim_qr_ticket(uuid, uuid) to authenticated;
