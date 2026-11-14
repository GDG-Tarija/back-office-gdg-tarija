/** Enfoca un control por id y lo trae a la vista; devuelve false si no existe. */
export function focusField(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}
