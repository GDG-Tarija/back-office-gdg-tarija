-- Check-in móvil: "Deshacer" un registro de asistencia recién hecho.
--
-- scan_logs solo tenía policies de INSERT y SELECT, así que un check-in hecho por error
-- (QR leído a la persona equivocada) no se podía corregir desde la puerta.
--
-- Aditiva: agrega una policy DELETE y no cambia datos ni otras policies. Solo permite borrar
-- el escaneo propio (scanned_by = auth.uid()) hecho hace menos de 60 s, y solo a quien tiene
-- rol en staff_whitelist y acceso al evento de la inscripción (SUPERADMIN o STAFF asignado).

create policy "staff_delete_recent_own_scan_logs" on public.scan_logs
  for delete
  to authenticated
  using (
    public.get_my_role() in ('SUPERADMIN', 'STAFF')
    and scanned_by = auth.uid()
    and scanned_at > now() - interval '60 seconds'
    and exists (
      select 1
      from public.registrations r
      where r.id = scan_logs.registration_id
        and public.has_event_access(r.event_id)
    )
  );

comment on policy "staff_delete_recent_own_scan_logs" on public.scan_logs is
  'Deshacer del check-in: el operador borra su propio escaneo de los últimos 60 s en eventos a los que tiene acceso.';

-- Corrección: staff_read_own_assignments estaba rota para STAFF.
--
-- La policy original resolvía el correo con (SELECT email FROM auth.users WHERE id = auth.uid()),
-- pero `authenticated` no tiene SELECT en auth.users: cualquier consulta de un STAFF fallaba con
-- 42501 y no podía leer sus propias asignaciones (solo funcionaba dentro de has_event_access,
-- que es SECURITY DEFINER). Se resuelve el correo con el claim `email` del JWT, que no requiere
-- tocar auth.users ni crear una función nueva. No amplía el acceso: cada STAFF sigue leyendo
-- únicamente las filas con su correo; SUPERADMIN, todas.

drop policy if exists "staff_read_own_assignments" on public.event_staff_assignments;

create policy "staff_read_own_assignments" on public.event_staff_assignments
  for select
  to authenticated
  using (
    public.is_superadmin()
    or lower(staff_email::text) = lower(auth.jwt() ->> 'email')
  );
