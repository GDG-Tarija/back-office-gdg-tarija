/**
 * Clases de los campos de filtro con icono a la izquierda (Inicio, Eventos). El icono es un
 * `<span>` posicionado sobre el campo; un filtro aplicado se tiñe de azul para que se note que la
 * vista no es el total. Las clases van completas (no interpoladas) para que Tailwind las detecte.
 */
export function filterSelectClass(active: boolean, extra = ''): string {
  return `w-full text-sm [&_.p-select-label]:pl-10 ${extra} ${active ? 'border-accent-text bg-info-bg' : ''}`;
}

export function filterDateClass(active: boolean, extra = ''): string {
  return `w-full text-sm [&_.p-datepicker-input]:px-10 md:[&_.p-datepicker-input]:min-h-10 ${extra} ${
    active ? '[&_.p-datepicker-input]:border-accent-text [&_.p-datepicker-input]:bg-info-bg' : ''
  }`;
}

export function filterIconClass(active: boolean): string {
  return `material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg ${
    active ? 'text-accent-text' : 'text-text-muted'
  }`;
}
