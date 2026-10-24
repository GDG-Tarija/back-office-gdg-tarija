-- ============================================================================
-- Seed de desarrollo — DATOS 100% FICTICIOS.
-- Se aplica en `supabase db reset` (local) y una sola vez en el proyecto dev.
-- NUNCA correr en producción.
--
-- Fechas relativas a now(): siempre hay 1 evento pasado y 2 próximos.
-- IDs fijos para poder referenciarlos en pruebas:
--   eventos   ...e1 (pasado) / ...e2 (próximo, pago) / ...e3 (próximo, gratis y virtual)
--   usuarios  ...a1..a8 (no pueden iniciar sesión: no tienen identidad de Google)
--   sesiones  d1d1d1d1-... a d6d6d6d6-... (el check-in usa los 16 primeros chars del id)
--
-- Para entrar al back-office local con tu cuenta de Google, después de tu primer
-- login corre en el Studio local (http://127.0.0.1:54323 → SQL Editor):
--   insert into public.staff_whitelist (email, role) values ('tu-correo@gmail.com', 'SUPERADMIN')
--   on conflict (email) do update set role = excluded.role;
-- Detalle en docs/entornos-supabase.md → "Darte acceso al back-office (local)".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Usuarios ficticios (el trigger on_auth_user_created crea public.users)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(),
  '{"provider": "google", "providers": ["google"]}'::jsonb,
  jsonb_build_object('given_name', u.first_name, 'family_name', u.last_name, 'full_name', u.first_name || ' ' || u.last_name),
  now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-0000000000a1'::uuid, 'organizador@gdg-tarija.test', 'Olivia',  'Organizadora'),
  ('00000000-0000-4000-8000-0000000000a2'::uuid, 'staff@gdg-tarija.test',       'Sergio',  'Staff'),
  ('00000000-0000-4000-8000-0000000000a3'::uuid, 'speaker@gdg-tarija.test',     'Paula',   'Ponente'),
  ('00000000-0000-4000-8000-0000000000a4'::uuid, 'ana@ejemplo.test',            'Ana',     'Asistente'),
  ('00000000-0000-4000-8000-0000000000a5'::uuid, 'bruno@ejemplo.test',          'Bruno',   'Becario'),
  ('00000000-0000-4000-8000-0000000000a6'::uuid, 'carla@ejemplo.test',          'Carla',   'Codera'),
  ('00000000-0000-4000-8000-0000000000a7'::uuid, 'diego@ejemplo.test',          'Diego',   'Developer'),
  ('00000000-0000-4000-8000-0000000000a8'::uuid, 'elena@ejemplo.test',          'Elena',   'Estudiante')
) as u(id, email, first_name, last_name);

update public.users set phone = '+59170000001' where id = '00000000-0000-4000-8000-0000000000a4';
update public.users set phone = '+59170000002' where id = '00000000-0000-4000-8000-0000000000a5';
update public.users set is_staff = true
where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');

insert into public.staff_whitelist (email, role) values
  ('organizador@gdg-tarija.test', 'SUPERADMIN'),
  ('staff@gdg-tarija.test',       'STAFF');

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------
insert into public.events (
  id, title, slug, event_type, capacity, date_start, date_end, is_published,
  description, image_url, location_type, location_name, address_link, category, extra_info
) values
  ('00000000-0000-4000-8000-0000000000e1', 'Build with AI (demo, pasado)', 'build-with-ai-demo', 'WORKSHOP', 60,
   date_trunc('day', now()) - interval '30 days' + interval '9 hours',
   date_trunc('day', now()) - interval '30 days' + interval '13 hours', true,
   'Workshop práctico de Gemini y agentes. Evento ficticio para desarrollo.',
   'https://res.cloudinary.com/dopkch3x9/image/upload/v1753129644/logoGDGTarija_lyzyzo.svg',
   'PHYSICAL', 'Auditorio Demo, Tarija', 'https://maps.google.com/?q=Tarija', 'IA, Gemini', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000e2', 'DevFest Tarija (demo)', 'devfest-tarija-demo', 'CONFERENCE', 150,
   date_trunc('day', now()) + interval '20 days' + interval '9 hours',
   date_trunc('day', now()) + interval '20 days' + interval '18 hours', true,
   'Conferencia con dos tracks, entradas gratuitas y de pago, y cupones. Evento ficticio para desarrollo.',
   'https://res.cloudinary.com/dopkch3x9/image/upload/v1753129644/logoGDGTarija_lyzyzo.svg',
   'PHYSICAL', 'Campus Demo, Tarija', 'https://maps.google.com/?q=Tarija', 'IA, Web, Cloud', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000e3', 'Cloud Study Jam (demo, virtual)', 'cloud-study-jam-demo', 'MEETUP', 100,
   date_trunc('day', now()) + interval '45 days' + interval '19 hours',
   date_trunc('day', now()) + interval '45 days' + interval '21 hours', true,
   'Meetup virtual gratuito. Evento ficticio para desarrollo.',
   null, 'VIRTUAL', 'Google Meet', null, 'Cloud', '{}'::jsonb);

-- Formulario de inscripción (misma forma que usan los eventos reales)
update public.events set extra_info = jsonb_build_object('form_fields', '[
  {"key": "discovery_source", "type": "select", "label": "¿Por qué medio te enteraste del evento?",
   "options": ["redes del GDG", "redes de la UCB", "centro de estudiantes/sociedad cientifica", "anuncios", "un amigo me invito"],
   "required": true, "placeholder": "Selecciona una opción"},
  {"key": "experience_level", "type": "select", "label": "Nivel de experiencia",
   "options": ["recien aprendiendo", "junior", "intermedio", "senior"],
   "required": true, "placeholder": "Selecciona tu nivel actual"},
  {"key": "has_laptop", "type": "checkbox", "label": "¿Cuentas con una laptop para llevar el día del evento?",
   "options": null, "required": false, "placeholder": null},
  {"key": "dietary_restrictions", "type": "text", "label": "Restricciones alimentarias (opcional)",
   "options": null, "required": false, "placeholder": "Ej. Vegano, alérgico al maní, celíaco, ninguno"}
]'::jsonb);

-- ---------------------------------------------------------------------------
-- Tipos de entrada (las de pago exigen payment_qr_url)
-- ---------------------------------------------------------------------------
insert into public.ticket_types (id, event_id, name, price, ticket_capacity, payment_qr_url, description) values
  ('00000000-0000-4000-8000-0000000001e1', '00000000-0000-4000-8000-0000000000e1', 'Entrada Gratuita', 0.00, 40, null, 'Acceso al workshop.'),
  ('00000000-0000-4000-8000-0000000002e1', '00000000-0000-4000-8000-0000000000e1', 'Entrada de Pago', 50.00, 20,
   'https://res.cloudinary.com/dopkch3x9/image/upload/v1753129644/logoGDGTarija_lyzyzo.svg', 'Incluye refrigerio.'),
  ('00000000-0000-4000-8000-0000000001e2', '00000000-0000-4000-8000-0000000000e2', 'Acceso General (Gratuito)', 0.00, 100, null, 'Charlas principales.'),
  ('00000000-0000-4000-8000-0000000002e2', '00000000-0000-4000-8000-0000000000e2', 'Ticket Básico', 15.00, 30,
   'https://res.cloudinary.com/dopkch3x9/image/upload/v1753129644/logoGDGTarija_lyzyzo.svg', 'Charlas + refrigerio.'),
  ('00000000-0000-4000-8000-0000000003e2', '00000000-0000-4000-8000-0000000000e2', 'Elite Builder', 125.00, 20,
   'https://res.cloudinary.com/dopkch3x9/image/upload/v1753129644/logoGDGTarija_lyzyzo.svg', 'Charlas + workshops + kit.'),
  ('00000000-0000-4000-8000-0000000001e3', '00000000-0000-4000-8000-0000000000e3', 'Entrada Gratuita', 0.00, 100, null, 'Acceso a la sala virtual.');

-- ---------------------------------------------------------------------------
-- Tracks y sesiones (agenda)
-- ---------------------------------------------------------------------------
insert into public.tracks (id, evento_id, nombre, descripcion) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e2', 'IA', 'Gemini, agentes y MCP.'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000e2', 'Web', 'Angular, PWAs y rendimiento.');

insert into public.sessions (id, event_id, track_id, title, capacity, date, start_time, end_time, speaker, city, topic, level) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1', null,
   'Introducción a Gemini', 40, (now() - interval '30 days')::date, '09:00', '10:30', 'Paula Ponente', 'Tarija, Bolivia', 'IA,Gemini', 'Basico'),
  ('d2d2d2d2-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000e1', null,
   'Agentes con Vertex AI', 40, (now() - interval '30 days')::date, '11:00', '12:30', 'Paula Ponente', 'Tarija, Bolivia', 'IA,Agentes', 'Intermedio'),
  ('d3d3d3d3-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1',
   'Servidores MCP en la práctica', 30, (now() + interval '20 days')::date, '09:00', '10:30', 'Paula Ponente', 'Tarija, Bolivia', 'IA,MCP', 'Intermedio'),
  ('d4d4d4d4-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1',
   'Evaluando agentes', 30, (now() + interval '20 days')::date, '11:00', '12:30', 'Speaker Invitado', 'Tarija, Bolivia', 'IA,Evals', 'Avanzado'),
  ('d5d5d5d5-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2',
   'Angular con signals', 30, (now() + interval '20 days')::date, '09:00', '10:30', 'Speaker Invitado', 'Tarija, Bolivia', 'Web,Angular', 'Basico'),
  ('d6d6d6d6-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2',
   'PWAs offline-first', 30, (now() + interval '20 days')::date, '11:00', '12:30', 'Speaker Invitado', 'Tarija, Bolivia', 'Web,PWA', 'Intermedio');

-- ---------------------------------------------------------------------------
-- Sponsors
-- ---------------------------------------------------------------------------
insert into public.sponsors (name, description, score, state) values
  ('Sponsor Oro (demo)',   'Empresa ficticia patrocinadora principal.', 'GOLD',   'ACTIVE'),
  ('Sponsor Plata (demo)', 'Empresa ficticia patrocinadora.',           'SILVER', 'ACTIVE'),
  ('Sponsor Antiguo (demo)', 'Sponsor inactivo para probar filtros.',   'BRONZE', 'INACTIVE');

-- ---------------------------------------------------------------------------
-- Cupones y staff por evento
-- ---------------------------------------------------------------------------
insert into public.event_coupons (id, event_id, code, role, max_uses) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e2', 'SPEAKER-DEMO', 'SPEAKER', 5),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000e2', 'STAFF-DEMO',   'STAFF',   10),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000e2', 'AMIGOS-DEMO',  'ATTENDEE', 3);

insert into public.event_staff_assignments (event_id, staff_email) values
  ('00000000-0000-4000-8000-0000000000e1', 'staff@gdg-tarija.test'),
  ('00000000-0000-4000-8000-0000000000e2', 'staff@gdg-tarija.test');

-- ---------------------------------------------------------------------------
-- Inscripciones
-- ---------------------------------------------------------------------------
insert into public.registrations (id, event_id, user_id, ticket_type_id, event_role, status, coupon_id, custom_responses) values
  -- Evento pasado
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a4',
   '00000000-0000-4000-8000-0000000001e1', 'ATTENDEE', 'CONFIRMED', null,
   '{"discovery_source": "redes del GDG", "experience_level": "junior", "has_laptop": true}'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a5',
   '00000000-0000-4000-8000-0000000002e1', 'ATTENDEE', 'CONFIRMED', null,
   '{"discovery_source": "un amigo me invito", "experience_level": "recien aprendiendo", "dietary_restrictions": "Vegano"}'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a6',
   '00000000-0000-4000-8000-0000000001e1', 'ATTENDEE', 'CONFIRMED', null,
   '{"discovery_source": "anuncios", "experience_level": "intermedio"}'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a2',
   '00000000-0000-4000-8000-0000000001e1', 'STAFF', 'CONFIRMED', null, '{}'),
  -- Evento próximo (pago): pendientes de pago, confirmadas y con cupón
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a4',
   '00000000-0000-4000-8000-0000000002e2', 'ATTENDEE', 'PENDING', null,
   '{"discovery_source": "redes del GDG", "experience_level": "junior", "has_laptop": true}'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a7',
   '00000000-0000-4000-8000-0000000003e2', 'ATTENDEE', 'CONFIRMED', null,
   '{"discovery_source": "redes de la UCB", "experience_level": "senior", "has_laptop": true}'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a8',
   '00000000-0000-4000-8000-0000000001e2', 'ATTENDEE', 'CONFIRMED', null,
   '{"discovery_source": "centro de estudiantes/sociedad cientifica", "experience_level": "recien aprendiendo"}'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a3',
   '00000000-0000-4000-8000-0000000001e2', 'ATTENDEE', 'PENDING', '00000000-0000-4000-8000-0000000000b1', '{}'),
  -- Evento virtual
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000a6',
   '00000000-0000-4000-8000-0000000001e3', 'ATTENDEE', 'CONFIRMED', null,
   '{"discovery_source": "redes del GDG", "experience_level": "intermedio"}');

-- Sesiones elegidas (sin choques de horario por inscripción)
insert into public.session_registrations (registration_id, session_id) values
  ('00000000-0000-4000-8000-000000000101', 'd1d1d1d1-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000101', 'd2d2d2d2-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000102', 'd1d1d1d1-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000103', 'd2d2d2d2-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000202', 'd3d3d3d3-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000202', 'd6d6d6d6-0000-4000-8000-000000000006'),
  ('00000000-0000-4000-8000-000000000203', 'd5d5d5d5-0000-4000-8000-000000000005');

-- ---------------------------------------------------------------------------
-- Check-ins del evento pasado (formato real: session_entry:<16 primeros chars del id>)
-- ---------------------------------------------------------------------------
insert into public.scan_logs (registration_id, scanned_by, scan_type, scanned_at) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000a2', 'checkin',
   date_trunc('day', now()) - interval '30 days' + interval '8 hours 50 minutes'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000a2', 'session_entry:' || left('d1d1d1d1-0000-4000-8000-000000000001', 16),
   date_trunc('day', now()) - interval '30 days' + interval '9 hours 2 minutes'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000a2', 'checkin',
   date_trunc('day', now()) - interval '30 days' + interval '8 hours 55 minutes'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000a2', 'refrigerio',
   date_trunc('day', now()) - interval '30 days' + interval '10 hours 35 minutes');
