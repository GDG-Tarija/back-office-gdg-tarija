import { Component, input, output } from '@angular/core';

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

  focusStay(): void {
    document.getElementById('unsaved-stay')?.focus();
  }
}
