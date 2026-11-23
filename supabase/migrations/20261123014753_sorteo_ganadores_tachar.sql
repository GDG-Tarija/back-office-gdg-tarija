-- Sorteo: tachar o eliminar ganadores desde la pantalla del sorteo (solo SUPERADMIN).
--   Tachado (voided_at): no estaba presente o se anuló. Sigue en la lista, NO vuelve a entrar al
--     sorteo y su premio se vuelve a sortear. Se puede deshacer.
--   Eliminado: como si nunca hubiera salido (ganadores de prueba); vuelve a participar.
-- draw_raffle() no cambia: ya excluye a toda inscripción con fila en raffle_winners.

alter table public.raffle_winners add column voided_at timestamptz;

comment on column public.raffle_winners.voided_at is
  'Cuándo se tachó al ganador (ausente o anulado). NULL = ganador vigente.';
comment on table public.raffle_winners is
  'Ganadores del sorteo. Los crea draw_raffle(); un superadmin puede tacharlos (voided_at) o eliminarlos. Nadie gana dos veces en el mismo evento.';

-- Desde el cliente solo se toca voided_at: el premio y el ganador los escribe draw_raffle().
revoke update on public.raffle_winners from anon, authenticated;
grant update (voided_at) on public.raffle_winners to authenticated;

create policy superadmin_void_raffle_winners on public.raffle_winners
  for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy superadmin_delete_raffle_winners on public.raffle_winners
  for delete to authenticated
  using (public.is_superadmin());
