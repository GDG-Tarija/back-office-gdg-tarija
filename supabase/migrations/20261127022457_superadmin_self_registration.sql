-- Un SUPERADMIN que se inscribe desde la web queda igual que cualquier persona.
--
-- process_registration_coupon() trataba toda sesión de SUPERADMIN como "modo administrador":
-- respetaba el estado, el rol y la fase enviados. Desde la web no se envía estado, así que la
-- inscripción caía en el default (PENDING) aunque el cupón fuera de descuento total o el paquete
-- gratis (pasó en DevFest 2026 con un organizador que usó el cupón de staff).
--
-- La policy insert_own_registrations solo deja crear la propia inscripción y el back-office no
-- crea inscripciones: con sesión, siempre es alguien inscribiéndose a sí mismo. El modo que
-- respeta lo enviado queda solo para conexiones sin JWT (consola, migraciones, service role),
-- que es como se corrigen datos a mano.
--
-- Solo cambia v_restricted y dos comentarios respecto de 20261107212751; el resto es idéntico.

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
  -- Toda sesión de la app sigue las reglas, también un SUPERADMIN que se inscribe desde la web.
  v_restricted      boolean := auth.uid() is not null;
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
      -- Solo conexiones sin JWT (consola, migraciones): respetan la fase enviada (sin validar cupo).
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

  -- Estado para usuarios normales: CONFIRMED si la fase (o paquete) es gratis o si traen un
  -- cupón válido (el cupón ATTENDEE es un descuento del 100%); PENDING si deben pagar.
  if v_restricted and (v_coupon_role is null or v_coupon_role = 'ATTENDEE') then
    new.status := case
      when v_coupon_role is not null or coalesce(v_price, 0) = 0 then 'CONFIRMED'
      else 'PENDING'
    end;
  end if;

  return new;
end;
$function$;
