-- Personas que no podían inscribirse: "No pudimos completar tu registro".
--
-- Si se borra la cuenta de login (auth.users) de alguien, su perfil en public.users queda con el
-- mismo correo. Cuando vuelve a entrar con Google se crea una cuenta nueva con otro id:
-- handle_new_user() choca con el correo (UNIQUE) y lo ignora, y upsert_user_profile() intenta
-- pasar el perfil viejo al id nuevo con UPDATE users SET id = ..., que fallaba si ese perfil
-- tenía inscripciones o escaneos (FK sin ON UPDATE). La persona quedaba sin perfil y su
-- inscripción violaba registrations_user_id_fkey. Pasó en prod con 2 cuentas (corregidas a mano
-- el 2026-11-27).
--
-- Con ON UPDATE CASCADE el cambio de id arrastra inscripciones y escaneos, y la cuenta se arregla
-- sola en el siguiente login. Sin cambios de datos.

alter table public.registrations
  drop constraint registrations_user_id_fkey,
  add constraint registrations_user_id_fkey
    foreign key (user_id) references public.users (id) on delete set null on update cascade;

alter table public.scan_logs
  drop constraint scan_logs_scanned_by_fkey,
  add constraint scan_logs_scanned_by_fkey
    foreign key (scanned_by) references public.users (id) on delete set null on update cascade;
