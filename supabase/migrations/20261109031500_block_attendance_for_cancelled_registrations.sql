-- Issue #7: una inscripción anulada (CANCELLED) no puede registrar asistencia.
--
-- El check-in por QR ya exige CONFIRMED en el back-office, pero el check-in manual inserta
-- directo en scan_logs y la policy staff_insert_scan_logs no mira el estado. Este trigger lo
-- garantiza en la base para cualquier camino: check-in, refrigerio e ingreso a sesiones
-- (scan_type 'checkin', 'refrigerio', 'session', 'session_entry:<id>').
--
-- - Solo bloquea CANCELLED. PENDING sigue las reglas de cada flujo (el QR exige CONFIRMED).
-- - No toca los scan_logs existentes: el historial de asistencia se conserva al anular.
-- - No cambia ninguna policy. Los permisos para cambiar el estado ya los da
--   staff_update_registrations (UPDATE solo si is_superadmin()); ver supabase/tests/.
-- - SECURITY INVOKER a propósito: quien puede insertar en scan_logs (SUPERADMIN o STAFF del
--   evento) también puede leer la inscripción, y así no se revela el estado de inscripciones
--   ajenas a quien igual sería rechazado por RLS.

create or replace function public.prevent_attendance_for_cancelled_registration()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
begin
  if exists (
    select 1
    from public.registrations r
    where r.id = new.registration_id
      and r.status = 'CANCELLED'
  ) then
    raise exception 'La inscripción está anulada: no se puede registrar asistencia.'
      using errcode = 'P0001',
            hint = 'Cambia el estado de la inscripción antes de registrar la asistencia.';
  end if;
  return new;
end;
$function$;

comment on function public.prevent_attendance_for_cancelled_registration() is
  'Trigger de scan_logs: rechaza registrar asistencia (check-in, refrigerio, sesiones) de inscripciones CANCELLED.';

drop trigger if exists trg_prevent_attendance_for_cancelled_registration on public.scan_logs;
create trigger trg_prevent_attendance_for_cancelled_registration
  before insert or update of registration_id on public.scan_logs
  for each row
  execute function public.prevent_attendance_for_cancelled_registration();
