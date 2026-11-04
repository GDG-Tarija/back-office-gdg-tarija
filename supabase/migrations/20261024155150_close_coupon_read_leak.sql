-- ============================================================================
-- !!! APLICAR SOLO DESPUÉS de desplegar el checkout público que usa
-- !!! rpc validate_coupon; si se aplica antes, el registro con cupón se rompe.
-- ============================================================================
-- Cierra la fuga de lectura de cupones: hoy cualquier usuario autenticado puede
-- leer todos los códigos de event_coupons. validate_coupon (SECURITY DEFINER)
-- devuelve solo el cupón pedido. La política superadmin_write_event_coupons
-- (FOR ALL) ya cubre SELECT para el SUPERADMIN.
-- NO APLICADA.

drop policy if exists authenticated_read_event_coupons on public.event_coupons;
