/** Overlays flotantes de PrimeNG que atienden Esc por su cuenta (listas, calendarios, menús). */
const FLOATING_OVERLAYS =
  '.p-select-overlay, .p-multiselect-overlay, .p-datepicker-panel, .p-popover';

/**
 * ¿Hay algo abierto por encima del diálogo identificado por `ownMask`? Una máscara de modal posterior
 * (p. ej. el ConfirmDialog) o un overlay flotante abierto significa que Esc no es para este diálogo.
 */
export function hasOverlayAbove(ownMask: string): boolean {
  if (document.querySelector(FLOATING_OVERLAYS)) return true;
  const masks = document.querySelectorAll('.p-dialog-mask');
  const top = masks[masks.length - 1];
  return !!top && !top.matches(ownMask);
}
