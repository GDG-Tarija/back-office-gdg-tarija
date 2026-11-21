-- Link del grupo de WhatsApp de cada evento, visible solo para inscritos.
--
-- Va en una tabla propia y no en `events` porque `events` es de lectura pública
-- (public_read_published_events): ahí el link quedaría al alcance de cualquiera vía API.
-- Lo leen quienes tienen una inscripción no anulada en el evento (pendiente o confirmada),
-- además de SUPERADMIN y el staff con acceso al evento. Lo edita SUPERADMIN, igual que `events`.
--
-- Aditiva: tabla nueva, no cambia datos ni policies existentes.

create table public.event_whatsapp_groups (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null unique references public.events (id) on delete cascade,
  url        text        not null check (url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+([?#].*)?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.event_whatsapp_groups is
  'Link de invitación al grupo de WhatsApp del evento. Solo lo leen inscritos no anulados y staff del evento.';

create trigger update_event_whatsapp_groups_updated_at
  before update on public.event_whatsapp_groups
  for each row
  execute function public.update_updated_at_column();

alter table public.event_whatsapp_groups enable row level security;

create policy "registered_read_event_whatsapp_groups" on public.event_whatsapp_groups
  for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_event_access(event_id)
    or exists (
      select 1
      from public.registrations r
      where r.event_id = event_whatsapp_groups.event_id
        and r.user_id = auth.uid()
        and r.status <> 'CANCELLED'
    )
  );

create policy "superadmin_write_event_whatsapp_groups" on public.event_whatsapp_groups
  for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
