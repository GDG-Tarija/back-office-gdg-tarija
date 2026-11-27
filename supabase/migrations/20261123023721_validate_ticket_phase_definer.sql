-- Cambiar el cupo de una fase desde el back-office fallaba con 42501 ("No tienes permisos"),
-- incluso para SUPERADMIN.
--
-- validate_ticket_phase() (trigger de ticket_phases) corría con los permisos de quien edita y, al
-- cambiar `capacity`, llama a ticket_phase_sold(), cuyo EXECUTE se revocó a authenticated en
-- 20261107212751_ticket_phases (a propósito: no se expone como RPC). Pasa a SECURITY DEFINER,
-- como los demás triggers que la usan; ya fija search_path y solo valida, no escribe nada.
-- No cambia datos ni la RLS de ticket_phases (sigue escribiendo solo SUPERADMIN).

alter function public.validate_ticket_phase() security definer;
