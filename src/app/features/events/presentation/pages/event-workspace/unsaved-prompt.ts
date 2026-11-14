import { signal } from '@angular/core';

import { UnsavedChoice } from '../../../../../shared/components/unsaved-changes-dialog/unsaved-changes-dialog';

/** Estado del diálogo "Guardar / Descartar / Seguir editando" con una API de promesa. */
export class UnsavedPrompt {
  readonly visible = signal(false);
  readonly saving = signal(false);
  private resolver: ((choice: UnsavedChoice) => void) | null = null;

  ask(): Promise<UnsavedChoice> {
    // Si ya hay una pregunta abierta, la anterior se resuelve como "seguir editando".
    this.resolver?.('stay');
    this.visible.set(true);
    return new Promise<UnsavedChoice>((resolve) => {
      this.resolver = resolve;
    });
  }

  answer(choice: UnsavedChoice): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.visible.set(false);
    resolve?.(choice);
  }
}
