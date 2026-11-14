import { Component, HostListener, input, output } from '@angular/core';

import { DialogModule } from 'primeng/dialog';

export type UnsavedChoice = 'save' | 'discard' | 'stay';

/** Confirmación de tres salidas para pestañas y rutas con cambios sin guardar. */
@Component({
  selector: 'app-unsaved-changes-dialog',
  standalone: true,
  imports: [DialogModule],
  templateUrl: './unsaved-changes-dialog.html',
})
export class UnsavedChangesDialog {
  readonly visible = input.required<boolean>();
  readonly saving = input(false);
  readonly choose = output<UnsavedChoice>();

  /** El diálogo vive en `body`, así que Esc se escucha en el documento y solo mientras está visible. */
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.visible() && !event.defaultPrevented) this.choose.emit('stay');
  }

  focusStay(): void {
    document.getElementById('unsaved-stay')?.focus();
  }
}
