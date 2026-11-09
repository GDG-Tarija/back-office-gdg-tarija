-- Cierra una escalada de privilegios en registrations.
-- Hasta ahora, sin cupón, el trigger dejaba pasar tal cual lo que mandara el cliente, y la policy
-- insert_own_registrations solo exige auth.uid() = user_id. Cualquier usuario con sesión podía
-- insertar event_role = 'STAFF'/'SPEAKER'/'SPONSOR' y status = 'CONFIRMED' (incluso en paquetes
-- de pago, sin comprobante) llamando a la API directamente.
--
-- Ahora, para usuarios autenticados que NO son SUPERADMIN:
--   * cupón con rol especial -> el rol sale del cupón y el estado es CONFIRMED (como antes)
--   * cualquier otro caso    -> rol ATTENDEE; estado CONFIRMED solo si el paquete es gratis,
--                               PENDING si es de pago (se confirma desde el back-office)
-- No afecta a SUPERADMIN ni a conexiones sin JWT (seed, service_role, migraciones).
-- Es lo mismo que ya manda el checkout público, así que el registro normal no cambia.

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

  -- Usuarios normales: nunca pueden fijar por sí mismos un rol especial ni confirmar un pago.
  if auth.uid() is not null
     and not public.is_superadmin()
     and (v_coupon_role is null or v_coupon_role = 'ATTENDEE') then
    select price into v_price from public.ticket_types where id = new.ticket_type_id;
    new.event_role := 'ATTENDEE';
    new.status     := case when coalesce(v_price, 0) = 0 then 'CONFIRMED' else 'PENDING' end;
  end if;

  return new;
end;
$function$;
