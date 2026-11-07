-- Preventa por fases: un paquete (ticket_types) puede tener fases (Preventa -> Normal) con precio,
-- cupo y QR propios. El asistente ve un solo paquete con la fase activa; al agotarse el cupo de una
-- fase se activa la siguiente. Un paquete SIN fases se comporta exactamente como antes.
--
-- Orden de triggers BEFORE INSERT en registrations (orden alfabético de nombre):
--   trg_process_registration_coupon -> único trigger: valida cupón, resuelve rol, asigna fase,
--   valida cupos y fija el estado. Se extiende (no se crea otro) porque la fase depende del rol
--   final (los cupones de rol especial no consumen cupo) y el estado depende del precio de la fase.
-- Conserva el endurecimiento de 20261104011118: usuarios no SUPERADMIN no fijan rol ni estado.

-- 1. Tabla ticket_phases -----------------------------------------------------------------------
create table public.ticket_phases (
  id             uuid                     not null default gen_random_uuid(),
  ticket_type_id uuid                     not null,
  name           varchar(100)             not null,
  position       integer                  not null,
  price          numeric(10,2)            not null default 0.00,
  capacity       integer,
  payment_qr_url text,
  created_at     timestamp with time zone not null default now(),
  updated_at     timestamp with time zone not null default now(),
  constraint ticket_phases_pkey primary key (id),
  constraint ticket_phases_ticket_type_id_fkey
    foreign key (ticket_type_id) references public.ticket_types(id) on delete cascade,
  constraint ticket_phases_position_key
    unique (ticket_type_id, position) deferrable initially immediate,
  constraint ticket_phases_position_check check (position >= 1),
  constraint ticket_phases_capacity_check check (capacity is null or capacity > 0),
  constraint check_qr_for_paid_phases check (
    (price = 0.00 and payment_qr_url is null)
    or (price > 0.00 and payment_qr_url is not null and payment_qr_url <> '')
  )
);

alter table public.ticket_phases enable row level security;

create policy "public_read_ticket_phases" on public.ticket_phases
  for select to public using (true);

create policy "staff_write_ticket_phases" on public.ticket_phases
  for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create trigger update_ticket_phases_updated_at
  before update on public.ticket_phases
  for each row execute function public.update_updated_at_column();

-- 2. registrations.ticket_phase_id -------------------------------------------------------------
alter table public.registrations add column ticket_phase_id uuid;

alter table public.registrations
  add constraint registrations_ticket_phase_id_fkey
  foreign key (ticket_phase_id) references public.ticket_phases(id) on delete restrict;

create index registrations_ticket_phase_id_idx on public.registrations (ticket_phase_id);

-- 3. Protecciones sobre ticket_phases ----------------------------------------------------------
-- Cuenta lo "vendido": solo asistentes (los cupones de rol especial no consumen cupo) con
-- inscripción CONFIRMED o PENDING (CANCELLED libera el cupo).
create or replace function public.ticket_phase_sold(p_phase_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(*)::integer
    from public.registrations
   where ticket_phase_id = p_phase_id
     and event_role = 'ATTENDEE'
     and status in ('CONFIRMED', 'PENDING');
$function$;

revoke all on function public.ticket_phase_sold(uuid) from public, anon, authenticated;

create or replace function public.validate_ticket_phase()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_sold integer;
begin
  -- Solo la última fase (mayor position) puede no tener cupo.
  if new.capacity is null and exists (
    select 1 from public.ticket_phases p
     where p.ticket_type_id = new.ticket_type_id
       and p.id <> new.id
       and p.position > new.position
  ) then
    raise exception 'Solo la última fase del paquete puede no tener cupo (sin límite).'
      using errcode = 'check_violation';
  end if;

  if new.capacity is not null and exists (
    select 1 from public.ticket_phases p
     where p.ticket_type_id = new.ticket_type_id
       and p.id <> new.id
       and p.capacity is null
       and p.position < new.position
  ) then
    raise exception 'Hay una fase sin cupo antes de esta: solo la última fase puede ser ilimitada.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.ticket_type_id <> old.ticket_type_id then
      raise exception 'Una fase no puede cambiarse de paquete.'
        using errcode = 'restrict_violation';
    end if;

    if new.capacity is not null and new.capacity is distinct from old.capacity then
      v_sold := public.ticket_phase_sold(old.id);
      if new.capacity < v_sold then
        raise exception 'No se puede bajar el cupo de la fase "%" a %: ya hay % inscripciones.',
          old.name, new.capacity, v_sold
          using errcode = 'restrict_violation';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

create trigger trg_validate_ticket_phase
  before insert or update on public.ticket_phases
  for each row execute function public.validate_ticket_phase();

create or replace function public.prevent_phase_delete_with_registrations()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.registrations r where r.ticket_phase_id = old.id) then
    raise exception 'No se puede eliminar la fase "%": tiene inscripciones.', old.name
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$function$;

create trigger trg_prevent_phase_delete
  before delete on public.ticket_phases
  for each row execute function public.prevent_phase_delete_with_registrations();

-- 4. Registro: cupón + fase + cupo + estado ----------------------------------------------------
-- Errores propios: P0002 cupón inválido, P0003 cupón agotado (ya existían),
--                  P0010 cupo agotado (fases o paquete llenos; no usar P0004: es assert_failure
--                        y PL/pgSQL no lo atrapa con WHEN OTHERS),
--                  P0011 fase que no pertenece al paquete (solo SUPERADMIN/sin JWT).
create or replace function public.process_registration_coupon()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_coupon_role     varchar(20);
  v_coupon_max_uses integer;
  v_coupon_used     integer;
  v_restricted      boolean := auth.uid() is not null and not public.is_superadmin();
  v_has_phases      boolean;
  v_pkg_capacity    integer;
  v_pkg_price       numeric;
  v_phase           record;
  v_chosen_id       uuid;
  v_chosen_price    numeric;
  v_last_id         uuid;
  v_last_price      numeric;
  v_price           numeric;
begin
  if new.coupon_id is not null then
    select role, max_uses
      into v_coupon_role, v_coupon_max_uses
      from public.event_coupons
     where id = new.coupon_id
       and event_id = new.event_id;

    if not found then
      raise exception 'El código de invitación o cupón no es válido para este evento.'
        using errcode = 'P0002';
    end if;

    select count(*)
      into v_coupon_used
      from public.registrations
     where coupon_id = new.coupon_id;

    if v_coupon_used >= v_coupon_max_uses then
      raise exception 'El código de invitación ya ha superado el número máximo de usos permitidos.'
        using errcode = 'P0003';
    end if;

    -- Cupón de invitación (Speaker/Staff/Sponsor): fuerza rol e inscripción confirmada.
    if v_coupon_role <> 'ATTENDEE' then
      new.event_role := v_coupon_role;
      new.status     := 'CONFIRMED';
    end if;
  end if;

  -- Usuarios normales: nunca fijan por sí mismos un rol especial.
  if v_restricted and (v_coupon_role is null or v_coupon_role = 'ATTENDEE') then
    new.event_role := 'ATTENDEE';
  end if;

  -- Fase y cupo --------------------------------------------------------------------------
  select price, ticket_capacity into v_pkg_price, v_pkg_capacity
    from public.ticket_types where id = new.ticket_type_id;

  v_has_phases := exists (
    select 1 from public.ticket_phases where ticket_type_id = new.ticket_type_id
  );

  if not v_has_phases then
    -- Paquete sin fases: comportamiento de siempre (sin cupo en servidor).
    if v_restricted then
      new.ticket_phase_id := null;
    elsif new.ticket_phase_id is not null then
      raise exception 'La fase indicada no pertenece al paquete de entrada.' using errcode = 'P0011';
    end if;
    v_price := v_pkg_price;
  else
    -- Serializa registros concurrentes del mismo paquete: el siguiente espera al commit del
    -- anterior y cuenta ya con su inscripción (READ COMMITTED toma snapshot nuevo por sentencia).
    perform 1 from public.ticket_types where id = new.ticket_type_id for no key update;

    if v_restricted then
      new.ticket_phase_id := null; -- el cliente nunca elige la fase
    end if;

    if new.ticket_phase_id is not null then
      -- Solo SUPERADMIN / conexiones sin JWT: respetan la fase enviada (sin validar cupo).
      select price into v_chosen_price
        from public.ticket_phases
       where id = new.ticket_phase_id and ticket_type_id = new.ticket_type_id;
      if not found then
        raise exception 'La fase indicada no pertenece al paquete de entrada.' using errcode = 'P0011';
      end if;
      v_price := v_chosen_price;
    else
      -- Cupo total del paquete (solo asistentes cuentan).
      if new.event_role = 'ATTENDEE' and v_pkg_capacity is not null and (
        select count(*) from public.registrations
         where ticket_type_id = new.ticket_type_id
           and event_role = 'ATTENDEE'
           and status in ('CONFIRMED', 'PENDING')
      ) >= v_pkg_capacity then
        raise exception 'El paquete de entrada está agotado.' using errcode = 'P0010';
      end if;

      -- Primera fase por position con cupo libre.
      for v_phase in
        select id, price, capacity from public.ticket_phases
         where ticket_type_id = new.ticket_type_id
         order by position
      loop
        v_last_id    := v_phase.id;
        v_last_price := v_phase.price;
        if v_phase.capacity is null or public.ticket_phase_sold(v_phase.id) < v_phase.capacity then
          v_chosen_id    := v_phase.id;
          v_chosen_price := v_phase.price;
          exit;
        end if;
      end loop;

      if v_chosen_id is null then
        if new.event_role = 'ATTENDEE' then
          raise exception 'Se agotó el cupo de todas las fases de este paquete de entrada.'
            using errcode = 'P0010';
        end if;
        -- Rol especial con todo lleno: no consume cupo, queda en la última fase.
        v_chosen_id    := v_last_id;
        v_chosen_price := v_last_price;
      end if;

      new.ticket_phase_id := v_chosen_id;
      v_price := v_chosen_price;
    end if;
  end if;

  -- Estado para usuarios normales: CONFIRMED solo si la fase (o paquete) es gratis.
  if v_restricted and (v_coupon_role is null or v_coupon_role = 'ATTENDEE') then
    new.status := case when coalesce(v_price, 0) = 0 then 'CONFIRMED' else 'PENDING' end;
  end if;

  return new;
end;
$function$;

-- 5. Disponibilidad pública (sin exponer inscripciones individuales) ---------------------------
-- Una fila por fase; los paquetes sin fases devuelven una fila con ticket_phase_id NULL.
-- is_active: la fase que recibe el próximo registro (false en todas si el paquete está agotado).
create or replace function public.get_ticket_availability(p_event_id uuid)
returns table (
  ticket_type_id   uuid,
  ticket_phase_id  uuid,
  name             text,
  "position"       integer,
  price            numeric,
  payment_qr_url   text,
  capacity         integer,
  sold             integer,
  remaining        integer,
  is_active        boolean,
  package_capacity integer,
  package_sold     integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pkg as (
    select t.id, t.ticket_capacity,
           (select count(*)::integer from public.registrations r
             where r.ticket_type_id = t.id
               and r.event_role = 'ATTENDEE'
               and r.status in ('CONFIRMED', 'PENDING')) as pkg_sold
      from public.ticket_types t
     where t.event_id = p_event_id
  ),
  phased as (
    select p.ticket_type_id, p.id as ticket_phase_id, p.name::text as name, p.position,
           p.price, p.payment_qr_url, p.capacity,
           (select count(*)::integer from public.registrations r
             where r.ticket_phase_id = p.id
               and r.event_role = 'ATTENDEE'
               and r.status in ('CONFIRMED', 'PENDING')) as sold
      from public.ticket_phases p
      join pkg on pkg.id = p.ticket_type_id
  ),
  phased_calc as (
    select ph.*,
           case when ph.capacity is null then null else greatest(ph.capacity - ph.sold, 0) end as remaining,
           (ph.capacity is null or ph.sold < ph.capacity) as has_room
      from phased ph
  ),
  first_open as (
    select distinct on (ticket_type_id) ticket_type_id, ticket_phase_id
      from phased_calc
     where has_room
     order by ticket_type_id, position
  )
  select pc.ticket_type_id, pc.ticket_phase_id, pc.name, pc.position, pc.price, pc.payment_qr_url,
         pc.capacity, pc.sold, pc.remaining,
         (fo.ticket_phase_id = pc.ticket_phase_id
          and (pkg.ticket_capacity is null or pkg.pkg_sold < pkg.ticket_capacity)) as is_active,
         pkg.ticket_capacity, pkg.pkg_sold
    from phased_calc pc
    join pkg on pkg.id = pc.ticket_type_id
    left join first_open fo on fo.ticket_type_id = pc.ticket_type_id
  union all
  select t.id, null::uuid, t.name::text, 1, t.price, t.payment_qr_url,
         t.ticket_capacity, pkg.pkg_sold,
         case when t.ticket_capacity is null then null
              else greatest(t.ticket_capacity - pkg.pkg_sold, 0) end,
         true, t.ticket_capacity, pkg.pkg_sold
    from public.ticket_types t
    join pkg on pkg.id = t.id
   where not exists (select 1 from public.ticket_phases p where p.ticket_type_id = t.id)
  order by 1, 4;
$function$;

grant execute on function public.get_ticket_availability(uuid) to anon, authenticated;
