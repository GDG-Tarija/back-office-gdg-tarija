SET local check_function_bodies = off;

CREATE TABLE "public"."event_coupons" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"   uuid                     NOT NULL,
  "code"       character varying(50)    NOT NULL,
  "role"       character varying(20)    NOT NULL DEFAULT 'ATTENDEE'::character varying,
  "max_uses"   integer                  NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "event_coupons_event_id_code_key" UNIQUE (event_id, code),
  CONSTRAINT "event_coupons_pkey" PRIMARY KEY (id),
  CONSTRAINT "event_coupons_role_check"
    CHECK
    (((role)::text = ANY (ARRAY[('ATTENDEE'::character varying)::text, ('SPEAKER'::character varying)::text, ('SPONSOR'::character varying)::text, ('STAFF'::character
    varying)::text])))
);

ALTER TABLE "public"."event_coupons"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."event_staff_assignments" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"    uuid                     NOT NULL,
  "staff_email" character varying        NOT NULL,
  "assigned_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "event_staff_assignments_event_id_staff_email_key" UNIQUE (event_id, staff_email),
  CONSTRAINT "event_staff_assignments_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."event_staff_assignments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"         character varying(255)   NOT NULL,
  "slug"          character varying(255)   NOT NULL,
  "event_type"    character varying(20)    NOT NULL,
  "capacity"      integer                  NOT NULL,
  "date_start"    timestamp with time zone NOT NULL,
  "date_end"      timestamp with time zone,
  "is_published"  boolean                  DEFAULT false,
  "created_at"    timestamp with time zone DEFAULT now(),
  "updated_at"    timestamp with time zone DEFAULT now(),
  "description"   text,
  "image_url"     text,
  "banner_url"    text,
  "location_type" character varying        DEFAULT 'PHYSICAL'::character varying,
  "location_name" text,
  "address_link"  text,
  "category"      character varying,
  "extra_info"    jsonb                    DEFAULT '{}'::jsonb,
  CONSTRAINT "check_location_type"
    CHECK (((location_type)::text = ANY ((ARRAY['PHYSICAL'::character varying, 'VIRTUAL'::character varying, 'HYBRID'::character varying])::text[]))),
  CONSTRAINT "events_event_type_check"
    CHECK
    (((event_type)::text = ANY ((ARRAY['MEETUP'::character varying, 'CONFERENCE'::character varying, 'HACKATHON'::character varying, 'WORKSHOP'::character varying])::text[]))),
  CONSTRAINT "events_pkey" PRIMARY KEY (id),
  CONSTRAINT "events_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."inscripciones_sessions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id"    uuid                     NOT NULL,
  "session_id"    uuid                     NOT NULL,
  "inscrito_en"   timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "asistio"       boolean                  NOT NULL DEFAULT false,
  "checked_in_at" timestamp with time zone,
  CONSTRAINT "inscripciones_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "unique_usuario_session" UNIQUE (usuario_id, session_id)
);

ALTER TABLE "public"."inscripciones_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."registrations" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"          uuid                     NOT NULL,
  "user_id"           uuid,
  "ticket_type_id"    uuid                     NOT NULL,
  "event_role"        character varying(20)    NOT NULL DEFAULT 'ATTENDEE'::character varying,
  "status"            character varying(20)    NOT NULL DEFAULT 'REGISTERED'::character varying,
  "created_at"        timestamp with time zone DEFAULT now(),
  "updated_at"        timestamp with time zone DEFAULT now(),
  "custom_responses"  jsonb                    DEFAULT '{}'::jsonb,
  "payment_proof_url" text,
  "coupon_id"         uuid,
  CONSTRAINT "registrations_event_id_user_id_key" UNIQUE (event_id, user_id),
  CONSTRAINT "registrations_event_role_check"
    CHECK (((event_role)::text = ANY ((ARRAY['ATTENDEE'::character varying, 'SPEAKER'::character varying, 'SPONSOR'::character varying, 'STAFF'::character varying])::text[]))),
  CONSTRAINT "registrations_pkey" PRIMARY KEY (id),
  CONSTRAINT "registrations_status_check"
    CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'CONFIRMED'::character varying, 'CANCELLED'::character varying])::text[])))
);

ALTER TABLE "public"."registrations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scan_logs" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "registration_id" uuid                     NOT NULL,
  "scanned_by"      uuid,
  "scan_type"       character varying(30)    NOT NULL,
  "scanned_at"      timestamp with time zone DEFAULT now(),
  "created_at"      timestamp with time zone DEFAULT now(),
  "updated_at"      timestamp with time zone DEFAULT now(),
  CONSTRAINT "scan_logs_pkey" PRIMARY KEY (id),
  CONSTRAINT "scan_logs_scan_type_check"
    CHECK
    ((((scan_type)::text = ANY ((ARRAY['checkin'::character varying, 'refrigerio'::character varying, 'session'::character varying])::text[])) OR ((scan_type)::text ~~
    'session_entry:%'::text))),
  CONSTRAINT "unique_registration_scan_type" UNIQUE (registration_id, scan_type)
);

ALTER TABLE "public"."scan_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."session_registrations" (
  "registration_id" uuid                     NOT NULL,
  "session_id"      uuid                     NOT NULL,
  "registered_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "session_registrations_pkey" PRIMARY KEY (registration_id, session_id)
);

ALTER TABLE "public"."session_registrations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sessions" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"   uuid                     NOT NULL,
  "title"      character varying(255)   NOT NULL,
  "capacity"   integer                  NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "start_time" time without time zone,
  "end_time"   time without time zone,
  "speaker"    text,
  "city"       text,
  CONSTRAINT "sessions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sponsors" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "name"        text,
  "description" text,
  "score"       text,
  CONSTRAINT "sponsors_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sponsors"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."staff_whitelist" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "email"      character varying(255)   NOT NULL,
  "role"       character varying(20)    NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "staff_whitelist_email_key" UNIQUE (email),
  CONSTRAINT "staff_whitelist_pkey" PRIMARY KEY (id),
  CONSTRAINT "staff_whitelist_role_check" CHECK (((role)::text = ANY ((ARRAY['SUPERADMIN'::character varying, 'STAFF'::character varying])::text[])))
);

ALTER TABLE "public"."staff_whitelist"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."ticket_types" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"        uuid                     NOT NULL,
  "name"            character varying(100)   NOT NULL,
  "price"           numeric(10,2)            NOT NULL DEFAULT 0.00,
  "ticket_capacity" integer,
  "created_at"      timestamp with time zone DEFAULT now(),
  "updated_at"      timestamp with time zone DEFAULT now(),
  "payment_qr_url"  text,
  "description"     text,
  "image_url"       text,
  CONSTRAINT "check_qr_for_paid_tickets" CHECK ((((price = 0.00) AND (payment_qr_url IS NULL)) OR ((price > 0.00) AND (payment_qr_url IS
    NOT NULL) AND (payment_qr_url <> ''::text)))),
  CONSTRAINT "ticket_types_event_id_name_key" UNIQUE (event_id, name),
  CONSTRAINT "ticket_types_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."ticket_types"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tracks" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "evento_id"   uuid                     NOT NULL,
  "nombre"      text                     NOT NULL,
  "descripcion" text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tracks_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tracks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."users" (
  "id"         uuid                     NOT NULL,
  "email"      character varying(255)   NOT NULL,
  "first_name" character varying(100)   NOT NULL,
  "last_name"  character varying(100)   NOT NULL,
  "avatar_url" text,
  "phone"      character varying(20),
  "extra_info" jsonb,
  "is_staff"   boolean                  DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "users_email_key" UNIQUE (email),
  CONSTRAINT "users_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."session_level" AS ENUM (
  'Basico',
  'Intermedio',
  'Avanzado'
);

ALTER TABLE "public"."sessions"
  ADD COLUMN "level" public.session_level;

ALTER TABLE "public"."sessions"
  ADD COLUMN "topic" text;

ALTER TABLE "public"."sessions"
  ADD COLUMN "date" date;

ALTER TABLE "public"."sessions"
  ADD COLUMN "track_id" uuid;

ALTER TABLE "public"."sessions"
  ADD COLUMN "speaker_avatar_url" text;

CREATE TYPE "public"."state_enum" AS ENUM (
  'ACTIVE',
  'INACTIVE'
);

ALTER TABLE "public"."sponsors"
  ADD COLUMN "state" public.state_enum NOT NULL DEFAULT 'ACTIVE'::public.state_enum;

ALTER TABLE "public"."sponsors"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."sponsors"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.check_session_datetime_conflict()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_date        date;
  v_start_time  time;
BEGIN
  -- Obtener fecha y hora de inicio de la sesión a registrar
  SELECT s.date, s.start_time
    INTO v_date, v_start_time
    FROM public.sessions s
   WHERE s.id = NEW.session_id;

  -- Solo validar cuando la sesión tiene fecha Y hora definidas.
  IF v_date IS NOT NULL AND v_start_time IS NOT NULL THEN

    IF EXISTS (
      SELECT 1
        FROM public.session_registrations sr
        JOIN public.sessions s ON s.id = sr.session_id
       WHERE sr.registration_id = NEW.registration_id
         AND sr.session_id     <> NEW.session_id
         AND s.date             = v_date
         AND s.start_time       = v_start_time
    ) THEN
      RAISE EXCEPTION
        'Conflicto de horario: ya estás inscrito en otra sesión a las % del %.',
        to_char(v_start_time, 'HH24:MI'),
        to_char(v_date, 'DD/MM/YYYY')
        USING ERRCODE = 'P0001';
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_coupon_uses (
  p_coupon_id uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)
    INTO v_count
    FROM public.registrations
   WHERE coupon_id = p_coupon_id;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
  RETURNS SETOF public.users
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT *
  FROM public.users
  WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select sw.role
  from public.staff_whitelist sw
  join auth.users au on au.email = sw.email
  where au.id = auth.uid()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_certificate (
  p_registration_id uuid
)
  RETURNS TABLE (
    registration_id  uuid,
    event_id         uuid,
    event_title      character varying,
    event_slug       character varying,
    event_banner_url text,
    event_date_start timestamp with time zone,
    event_date_end   timestamp with time zone,
    event_role       character varying,
    ticket_name      character varying,
    check_in_date    timestamp with time zone,
    user_first_name  character varying,
    user_last_name   character varying,
    user_email       character varying,
    user_id          uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  -- Validamos de forma estricta que la inscripción cuente con registro de asistencia (check-in)
  -- Calificamos scan_logs.registration_id para evitar conflictos con la columna de retorno
  IF NOT EXISTS (
    SELECT 1 FROM public.scan_logs sl
    WHERE sl.registration_id = p_registration_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id AS registration_id,
    r.event_id,
    e.title AS event_title,
    e.slug AS event_slug,
    e.banner_url AS event_banner_url,
    e.date_start AS event_date_start,
    e.date_end AS event_date_end,
    r.event_role AS event_role,
    t.name AS ticket_name,
    COALESCE(s.scanned_at, r.created_at) AS check_in_date,
    u.first_name AS user_first_name,
    u.last_name AS user_last_name,
    u.email AS user_email,
    r.user_id
  FROM public.registrations r
  INNER JOIN public.events e ON e.id = r.event_id
  LEFT JOIN public.ticket_types t ON t.id = r.ticket_type_id
  LEFT JOIN public.users u ON u.id = r.user_id
  LEFT JOIN LATERAL (
    SELECT sl_lat.scanned_at FROM public.scan_logs sl_lat
    WHERE sl_lat.registration_id = r.id
    ORDER BY sl_lat.scanned_at ASC
    LIMIT 1
  ) s ON true
  WHERE r.id = p_registration_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  BEGIN
    INSERT INTO public.users (id, email, first_name, last_name, avatar_url)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
        NEW.raw_user_meta_data ->> 'given_name',
        split_part(NEW.email, '@', 1)
      ),
      COALESCE(NEW.raw_user_meta_data ->> 'family_name', ''),
      COALESCE(
        NEW.raw_user_meta_data ->> 'avatar_url',
        NEW.raw_user_meta_data ->> 'picture'
      )
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: could not auto-create profile for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.has_event_access (
  p_event_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    public.is_superadmin()
    or exists (
      select 1
      from public.event_staff_assignments esa
      join auth.users au on au.email = esa.staff_email
      where au.id = auth.uid()
        and esa.event_id = p_event_id
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT COALESCE((SELECT is_staff FROM public.users WHERE id = auth.uid()), false)
     OR EXISTS (
       SELECT 1 FROM public.staff_whitelist sw
       JOIN auth.users au ON au.email = sw.email
       WHERE au.id = auth.uid()
     );
$function$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce(public.get_my_role() = 'SUPERADMIN', false);
$function$;

CREATE OR REPLACE FUNCTION public.prevent_event_delete_with_registrations()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if exists (select 1 from public.registrations r where r.event_id = old.id) then
    raise exception 'No se puede eliminar el evento "%": tiene inscripciones. Despublícalo en su lugar.', old.title
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_session_delete_with_registrations()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if exists (select 1 from public.session_registrations sr where sr.session_id = old.id) then
    raise exception 'No se puede eliminar la sesión: tiene inscritos.'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_registration_coupon()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_coupon_role       varchar(20);
  v_coupon_max_uses   integer;
  v_coupon_used       integer;
BEGIN
  -- Si no se suministró un cupón, no hay nada que validar
  IF NEW.coupon_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener datos del cupón y validar que pertenezca al evento
  SELECT role, max_uses
    INTO v_coupon_role, v_coupon_max_uses
    FROM public.event_coupons
   WHERE id = NEW.coupon_id
     AND event_id = NEW.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El código de invitación o cupón no es válido para este evento.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Validar que no se haya superado el límite de usos
  SELECT count(*)
    INTO v_coupon_used
    FROM public.registrations
   WHERE coupon_id = NEW.coupon_id;

  IF v_coupon_used >= v_coupon_max_uses THEN
    RAISE EXCEPTION 'El código de invitación ya ha superado el número máximo de usos permitidos.'
      USING ERRCODE = 'P0003';
  END IF;

  -- Forzar el rol e inscripción confirmada si es un cupón de invitación (Speaker/Staff/Sponsor)
  IF v_coupon_role <> 'ATTENDEE' THEN
    NEW.event_role := v_coupon_role;
    NEW.status     := 'CONFIRMED';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_asistencia_qr (
  p_usuario_id uuid,
  p_session_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
    v_existe_inscripcion INT;
BEGIN
    -- 1. Verificar si el usuario realmente se inscribió a esta sesión/taller
    SELECT COUNT(*) INTO v_existe_inscripcion
    FROM public.inscripciones_sessions
    WHERE usuario_id = p_usuario_id AND session_id = p_session_id;

    IF v_existe_inscripcion = 0 THEN
        RETURN 'ERROR_NO_INSCRITO_EN_SESION';
    END IF;

    -- 2. Si está inscrito, registrar que ya entró a la sala
    UPDATE public.inscripciones_sessions
    SET asistio = TRUE,
        checked_in_at = timezone('utc'::text, now())
    WHERE usuario_id = p_usuario_id AND session_id = p_session_id;

    RETURN 'OK';
END;
$function$;

REVOKE ALL ON FUNCTION "public"."registrar_asistencia_qr"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_profile (
  p_first_name text,
  p_last_name  text,
  p_phone      text
)
  RETURNS SETOF public.users
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.users
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    phone = p_phone
  WHERE id = auth.uid()
  RETURNING *;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_user_profile (
  p_id         uuid,
  p_email      text,
  p_first_name text,
  p_last_name  text,
  p_avatar_url text DEFAULT NULL::text
)
  RETURNS SETOF public.users
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF p_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para modificar este perfil' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE email = p_email AND id <> p_id) THEN
    UPDATE public.users SET
      id = p_id,
      first_name = p_first_name,
      last_name = p_last_name,
      avatar_url = COALESCE(p_avatar_url, avatar_url)
    WHERE email = p_email;
    RETURN QUERY SELECT * FROM public.users WHERE id = p_id;
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.users (id, email, first_name, last_name, avatar_url)
  VALUES (p_id, p_email, p_first_name, p_last_name, p_avatar_url)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url)
  RETURNING *;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_coupon (
  p_event_id uuid,
  p_code     text
)
  RETURNS TABLE (
    id        uuid,
    role      text,
    max_uses  integer,
    uses_left integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select c.id,
         c.role::text,
         c.max_uses::integer,
         greatest(c.max_uses - coalesce(public.get_coupon_uses(c.id), 0), 0)::integer
  from public.event_coupons c
  where c.event_id = p_event_id
    and lower(c.code) = lower(btrim(p_code))
  limit 1;
$function$;

REVOKE ALL ON FUNCTION "public"."validate_coupon"(uuid, text) FROM PUBLIC, "anon";

ALTER TABLE "public"."event_coupons"
  ADD CONSTRAINT "event_coupons_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."event_staff_assignments"
  ADD CONSTRAINT "event_staff_assignments_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_coupon_id_fkey" FOREIGN KEY (coupon_id) REFERENCES public.event_coupons(id) ON DELETE SET NULL;

ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."scan_logs"
  ADD CONSTRAINT "scan_logs_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;

ALTER TABLE "public"."session_registrations"
  ADD CONSTRAINT "session_registrations_registration_id_fkey" FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT "sessions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."inscripciones_sessions"
  ADD CONSTRAINT "inscripciones_sessions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."session_registrations"
  ADD CONSTRAINT "session_registrations_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."ticket_types"
  ADD CONSTRAINT "ticket_types_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_ticket_type_id_fkey" FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE RESTRICT;

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT "sessions_track_id_fkey" FOREIGN KEY (track_id) REFERENCES public.tracks(id) ON DELETE SET NULL;

ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."scan_logs"
  ADD CONSTRAINT "scan_logs_scanned_by_fkey" FOREIGN KEY (scanned_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_prevent_event_delete
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_delete_with_registrations();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_process_registration_coupon
  BEFORE INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.process_registration_coupon();

CREATE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scan_logs_updated_at
  BEFORE UPDATE ON public.scan_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_session_datetime_conflict
  BEFORE INSERT ON public.session_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_session_datetime_conflict();

CREATE TRIGGER trg_prevent_session_delete
  BEFORE DELETE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_session_delete_with_registrations();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.sponsors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_staff_whitelist_updated_at
  BEFORE UPDATE ON public.staff_whitelist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_types_updated_at
  BEFORE UPDATE ON public.ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_tracks_updated_at
  BEFORE UPDATE ON public.tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "authenticated_read_event_coupons" ON "public"."event_coupons"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "superadmin_write_event_coupons" ON "public"."event_coupons"
  FOR ALL
  TO "authenticated"
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "staff_read_own_assignments" ON "public"."event_staff_assignments"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_superadmin() OR ((staff_email)::text = (( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text)));

CREATE POLICY "superadmin_write_assignments" ON "public"."event_staff_assignments"
  FOR ALL
  TO "authenticated"
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "public_read_published_events" ON "public"."events"
  FOR SELECT
  TO PUBLIC
  USING (((is_published = true) OR public.is_superadmin() OR public.has_event_access(id)));

CREATE POLICY "staff_write_events" ON "public"."events"
  FOR ALL
  TO "authenticated"
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Permitir lectura de inscripciones a usuarios autenticados" ON "public"."inscripciones_sessions"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "staff_update_inscripciones_sessions" ON "public"."inscripciones_sessions"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "insert_own_registrations" ON "public"."registrations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "select_own_or_staff_registrations" ON "public"."registrations"
  FOR SELECT
  TO PUBLIC
  USING (((auth.uid() = user_id) OR public.is_superadmin() OR public.has_event_access(event_id)));

CREATE POLICY "staff_update_registrations" ON "public"."registrations"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "staff_insert_scan_logs" ON "public"."scan_logs"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.is_superadmin() OR (EXISTS ( SELECT 1
   FROM public.registrations r
  WHERE ((r.id = scan_logs.registration_id) AND public.has_event_access(r.event_id))))));

CREATE POLICY "staff_select_scan_logs" ON "public"."scan_logs"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_superadmin() OR (EXISTS ( SELECT 1
   FROM public.registrations r
  WHERE ((r.id = scan_logs.registration_id) AND public.has_event_access(r.event_id))))));

CREATE POLICY "user_select_own_scan_logs" ON "public"."scan_logs"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.registrations r
  WHERE ((r.id = scan_logs.registration_id) AND (r.user_id = auth.uid())))));

CREATE POLICY "attendee_delete_own_session_reg" ON "public"."session_registrations"
  FOR DELETE
  TO PUBLIC
  USING ((registration_id IN ( SELECT registrations.id
   FROM public.registrations
  WHERE (registrations.user_id = auth.uid()))));

CREATE POLICY "attendee_insert_own_session_reg" ON "public"."session_registrations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((registration_id IN ( SELECT registrations.id
   FROM public.registrations
  WHERE (registrations.user_id = auth.uid()))));

CREATE POLICY "public_read_session_registrations" ON "public"."session_registrations"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "public_read_sessions" ON "public"."sessions"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "superadmin_write_sessions" ON "public"."sessions"
  FOR ALL
  TO "authenticated"
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "anon_select_sponsors" ON "public"."sponsors"
  FOR SELECT
  TO "anon"
  USING (true);

CREATE POLICY "auth_select_sponsors" ON "public"."sponsors"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "staff_delete_sponsors" ON "public"."sponsors"
  FOR DELETE
  TO "authenticated"
  USING (public.is_staff());

CREATE POLICY "staff_insert_sponsors" ON "public"."sponsors"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_staff());

CREATE POLICY "staff_update_sponsors" ON "public"."sponsors"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "public_read_ticket_types" ON "public"."ticket_types"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "staff_write_ticket_types" ON "public"."ticket_types"
  FOR ALL
  TO "authenticated"
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "public_read_tracks" ON "public"."tracks"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "superadmin_write_tracks" ON "public"."tracks"
  FOR ALL
  TO "authenticated"
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "staff_full_access_users" ON "public"."users"
  FOR ALL
  TO PUBLIC
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "staff_select_users_for_assigned_events" ON "public"."users"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.registrations r
  WHERE ((r.user_id = users.id) AND public.has_event_access(r.event_id)))));

CREATE POLICY "users_insert_own" ON "public"."users"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "users_select_own" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING ((id = auth.uid()));

CREATE POLICY "users_update_own" ON "public"."users"
  FOR UPDATE
  TO PUBLIC
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "event_assets_public_read" ON "storage"."objects"
  FOR SELECT
  TO PUBLIC
  USING ((bucket_id = 'event-assets'::text));

CREATE POLICY "event_assets_superadmin_delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'event-assets'::text) AND public.is_superadmin()));

CREATE POLICY "event_assets_superadmin_insert" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'event-assets'::text) AND public.is_superadmin()));

CREATE POLICY "event_assets_superadmin_update" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'event-assets'::text) AND public.is_superadmin()))
  WITH CHECK (((bucket_id = 'event-assets'::text) AND public.is_superadmin()));

CREATE POLICY "payment_proofs_insert" ON "storage"."objects"
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK ((bucket_id = 'payment-proofs'::text));

CREATE POLICY "payment_proofs_select" ON "storage"."objects"
  FOR SELECT
  TO PUBLIC
  USING ((bucket_id = 'payment-proofs'::text));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."session_registrations";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."sponsors";

COMMENT ON COLUMN "public"."sessions"."city" IS 'Ciudad de origen del speaker';

COMMENT ON COLUMN "public"."sessions"."date" IS 'Fecha en que se realiza la sesión (ej: 2025-09-20)';

COMMENT ON COLUMN "public"."sessions"."end_time" IS 'Hora de fin de la sesión (ej: 10:00)';

COMMENT ON COLUMN "public"."sessions"."level" IS 'Nivel de dificultad: Basico, Intermedio o Avanzado';

COMMENT ON COLUMN "public"."sessions"."speaker" IS 'Nombre del speaker / ponente';

COMMENT ON COLUMN "public"."sessions"."speaker_avatar_url" IS 'URL de la imagen de perfil / avatar del speaker';

COMMENT ON COLUMN "public"."sessions"."start_time" IS 'Hora de inicio de la sesión (ej: 09:00)';

COMMENT ON COLUMN "public"."sessions"."topic" IS 'Temas separados por comas (ej: "Kotlin,Android,Jetpack")';

COMMENT ON FUNCTION "public"."check_session_datetime_conflict"() IS 'Impide que un mismo asistente se inscriba en dos sesiones con la misma fecha y hora de inicio.';

COMMENT ON FUNCTION "public"."get_coupon_uses"(uuid) IS 'Obtiene el conteo real de usos de un cupón determinado, saltándose las restricciones de RLS de registrations.';

COMMENT ON FUNCTION "public"."get_public_certificate"(uuid) IS 'Obtiene de forma pública los datos consolidados de un certificado válido (con asistencia registrada) sin comprometer las políticas generales RLS.';

COMMENT ON FUNCTION "public"."process_registration_coupon"() IS 'Valida las restricciones del cupón/código de invitación de forma atómica y configura el rol y estado del asistente.';

GRANT EXECUTE ON FUNCTION "public"."check_session_datetime_conflict"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."check_session_datetime_conflict"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."check_session_datetime_conflict"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."check_session_datetime_conflict"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_coupon_uses"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_coupon_uses"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_coupon_uses"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_coupon_uses"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_profile"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_profile"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_profile"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_profile"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_public_certificate"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_public_certificate"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_certificate"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_certificate"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."has_event_access"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."has_event_access"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."has_event_access"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."has_event_access"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_staff"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_staff"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_superadmin"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_superadmin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_superadmin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_superadmin"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."prevent_event_delete_with_registrations"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."prevent_event_delete_with_registrations"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_event_delete_with_registrations"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_event_delete_with_registrations"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."prevent_session_delete_with_registrations"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."prevent_session_delete_with_registrations"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_session_delete_with_registrations"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_session_delete_with_registrations"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."process_registration_coupon"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."process_registration_coupon"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_registration_coupon"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_registration_coupon"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."registrar_asistencia_qr"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."registrar_asistencia_qr"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."registrar_asistencia_qr"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_user_profile"(text, text, text) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."update_user_profile"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_user_profile"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_user_profile"(text, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."upsert_user_profile"(uuid, text, text, text, text) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."upsert_user_profile"(uuid, text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."upsert_user_profile"(uuid, text, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."upsert_user_profile"(uuid, text, text, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."validate_coupon"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."validate_coupon"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_coupon"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_coupon"(uuid, text) TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_coupons" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."event_coupons" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_coupons" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_coupons" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_staff_assignments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."event_staff_assignments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_staff_assignments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_staff_assignments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inscripciones_sessions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."inscripciones_sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inscripciones_sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inscripciones_sessions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."registrations" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."registrations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."registrations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."registrations" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scan_logs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."scan_logs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scan_logs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scan_logs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."session_registrations" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."session_registrations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."session_registrations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."session_registrations" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sponsors" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sponsors" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sponsors" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sponsors" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff_whitelist" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."staff_whitelist" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff_whitelist" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff_whitelist" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ticket_types" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."ticket_types" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ticket_types" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ticket_types" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tracks" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."tracks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tracks" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tracks" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."users" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "service_role";

