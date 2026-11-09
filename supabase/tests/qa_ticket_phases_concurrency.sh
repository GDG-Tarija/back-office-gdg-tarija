#!/usr/bin/env bash
# Concurrencia: dos transacciones intentan tomar el ÚLTIMO cupo de una fase al mismo tiempo.
# La A inserta y mantiene la transacción abierta 4 s; la B arranca a los ~1 s. Esperado:
# B queda bloqueada por el lock del paquete, y al commit de A cuenta el cupo ya usado -> falla con P0010.
# Usa datos COMMITEADOS (necesario para 2 sesiones) y los borra al final; imprime los residuos (0).
# Uso: DB=<base> ./supabase/tests/qa_ticket_phases_concurrency.sh   (por defecto la base local "postgres")
set -u
DB="${DB:-postgres}"
PSQL="docker exec -i supabase_db_gdg-tarija psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q -t -A"

cleanup() {
  $PSQL <<'SQL'
delete from public.registrations where event_id = 'bbbbbbbb-1111-4000-8000-000000000001';
delete from public.events where id = 'bbbbbbbb-1111-4000-8000-000000000001';
delete from public.users where email like 'qa-conc-%@test.local';
delete from auth.users where email like 'qa-conc-%@test.local';
SQL
}
trap cleanup EXIT

$PSQL <<'SQL'
insert into auth.users (id, email) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'qa-conc-a@test.local'),
  ('aaaaaaaa-1111-4000-8000-000000000002', 'qa-conc-b@test.local');
insert into public.users (id, email, first_name, last_name)
  select id, email, 'QA', 'Conc' from auth.users where email like 'qa-conc-%@test.local' on conflict do nothing;
insert into public.events (id, title, slug, event_type, capacity, date_start)
  values ('bbbbbbbb-1111-4000-8000-000000000001', 'QA concurrencia', 'qa-concurrencia', 'MEETUP', 10, now() + interval '30 days');
insert into public.ticket_types (id, event_id, name, price, payment_qr_url)
  values ('cccccccc-1111-4000-8000-000000000001', 'bbbbbbbb-1111-4000-8000-000000000001', 'Conc', 30, 'https://x/qr.png');
insert into public.ticket_phases (ticket_type_id, name, position, price, capacity, payment_qr_url)
  values ('cccccccc-1111-4000-8000-000000000001', 'Preventa (1 cupo)', 1, 30, 1, 'https://x/qr.png');
SQL

attempt() { # $1 = sufijo de usuario (1|2), $2 = segundos de sleep dentro de la transacción
  $PSQL <<SQL 2>&1
begin;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1111-4000-8000-00000000000$1","role":"authenticated"}', true);
set local role authenticated;
insert into public.registrations (event_id, user_id, ticket_type_id)
  values ('bbbbbbbb-1111-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-00000000000$1', 'cccccccc-1111-4000-8000-000000000001');
select pg_sleep($2);
commit;
SQL
}

attempt 1 4 > /tmp/qa_conc_a.out &  PID_A=$!
sleep 1
START=$(date +%s)
attempt 2 0 > /tmp/qa_conc_b.out || true
ELAPSED=$(( $(date +%s) - START ))
wait $PID_A

echo "A: $(cat /tmp/qa_conc_a.out | tr '\n' ' ')"
echo "B: $(cat /tmp/qa_conc_b.out | tr '\n' ' ')  (esperó ~${ELAPSED}s)"
OK_A=$(grep -c ERROR /tmp/qa_conc_a.out); ERR_B=$(grep -c "agot" /tmp/qa_conc_b.out)
N=$($PSQL -c "select count(*) from public.registrations where event_id='bbbbbbbb-1111-4000-8000-000000000001'")
if [ "$OK_A" = 0 ] && [ "$ERR_B" -ge 1 ] && [ "$N" = 1 ] && [ "$ELAPSED" -ge 2 ]; then
  echo "PASS: A tomó el último cupo; B esperó el lock y falló por cupo agotado (1 registro en total)"
else
  echo "FAIL: A_err=$OK_A B_agotado=$ERR_B registros=$N espera=${ELAPSED}s"; RC=1
fi
cleanup; trap - EXIT
echo "residuos: $($PSQL -c "select (select count(*) from public.events where slug='qa-concurrencia') + (select count(*) from auth.users where email like 'qa-conc-%@test.local')")"
exit ${RC:-0}
