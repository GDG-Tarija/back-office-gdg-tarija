import { Injectable, inject } from '@angular/core';

import { ConfirmationService, MessageService } from 'primeng/api';

export interface ConfirmOptions {
  titulo: string;
  mensaje: string;
  aceptar: string;
  peligro?: boolean;
}

/** Toasts y confirmaciones globales (`p-toast` y `p-confirmdialog` viven en AdminLayout). */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly messages = inject(MessageService);
  private readonly confirmations = inject(ConfirmationService);

  success(message: string): void {
    this.messages.add({ severity: 'success', summary: message, life: 4000 });
  }

  error(message: string): void {
    this.messages.add({ severity: 'error', summary: message, life: 8000 });
  }

  confirm({ titulo, mensaje, aceptar, peligro = false }: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.confirmations.confirm({
        header: titulo,
        message: mensaje,
        acceptLabel: aceptar,
        rejectLabel: 'Cancelar',
        acceptButtonProps: { severity: peligro ? 'danger' : 'primary' },
        rejectButtonProps: { severity: 'secondary', outlined: true },
        defaultFocus: peligro ? 'reject' : 'accept',
        closable: true,
        closeOnEscape: true,
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }
}
