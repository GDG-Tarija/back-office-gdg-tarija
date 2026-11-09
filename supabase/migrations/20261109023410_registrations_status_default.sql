-- registrations.status tenía DEFAULT 'REGISTERED', valor que su propio CHECK rechaza
-- (solo permite PENDING, CONFIRMED, CANCELLED). Cualquier insert que no enviara status
-- fallaba con 23514. El checkout público dejó de enviarlo (lo fija el trigger), pero el
-- trigger solo lo fija para usuarios autenticados que no son SUPERADMIN: un SUPERADMIN, o una
-- conexión sin JWT, que no enviaba status caía en el default inválido.
-- PENDING es el valor seguro: no confirma un pago sin que alguien lo apruebe. Para usuarios
-- normales no cambia nada, el trigger process_registration_coupon ya sobrescribe el estado.

alter table public.registrations
  alter column status set default 'PENDING';
