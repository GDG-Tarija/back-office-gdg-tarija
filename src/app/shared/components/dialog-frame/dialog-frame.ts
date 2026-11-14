import { Component, HostListener, OnDestroy, computed, input, output, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';

export type DialogSize = 'sm' | 'md' | 'lg';

const SIZE_WIDTH: Record<DialogSize, string> = {
  sm: '28rem',
  md: '42rem',
  lg: '56rem',
};

@Component({
  selector: 'app-dialog-frame',
  standalone: true,
  imports: [DialogModule],
  templateUrl: './dialog-frame.html',
})
export class DialogFrame implements OnDestroy {
  title = input.required<string>();
  icon = input<string>('edit');
  initialSize = input<DialogSize>('md');
  /** Con cambios sin guardar, cerrar pide confirmación antes de emitir `closeDialog`. */
  dirty = input<boolean>(false);

  closeDialog = output<void>();

  readonly fullscreen = signal(false);
  readonly confirmingDiscard = signal(false);
  // El tamaño se fija al abrir: el frame vive solo mientras el diálogo está abierto.
  readonly canMaximize = computed(() => this.initialSize() !== 'sm');
  readonly dialogStyle = computed(() =>
    this.fullscreen()
      ? { width: '100vw', height: '100dvh', maxHeight: '100dvh', borderRadius: '0' }
      : { width: `min(calc(100vw - 1rem), ${SIZE_WIDTH[this.initialSize()]})` },
  );

  private readonly opener = document.activeElement as HTMLElement | null;
  private fieldBeforeConfirm: HTMLElement | null = null;

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (event.defaultPrevented) return;
    if (this.confirmingDiscard()) {
      this.keepEditing();
    } else {
      this.requestClose();
    }
  }

  @HostListener('document:click', ['$event'])
  onMaskClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    // Con la confirmación abierta, un clic en su máscara no debe cerrar el diálogo de abajo.
    if (target?.classList.contains('app-dialog-mask') && !this.confirmingDiscard()) {
      this.requestClose();
    }
  }

  toggleFullscreen(): void {
    this.fullscreen.update((v) => !v);
  }

  requestClose(): void {
    if (this.dirty()) {
      this.fieldBeforeConfirm = document.activeElement as HTMLElement | null;
      this.confirmingDiscard.set(true);
    } else {
      this.closeDialog.emit();
    }
  }

  // A (`fix/ui-base`) provee FeedbackService: unificar esta confirmación con él cuando se mergee.
  keepEditing(): void {
    this.confirmingDiscard.set(false);
    this.fieldBeforeConfirm?.focus();
  }

  discard(): void {
    this.confirmingDiscard.set(false);
    this.closeDialog.emit();
  }

  ngOnDestroy(): void {
    // El disparador puede haber sido re-renderizado; si sigue en el DOM, devuélvele el foco.
    if (this.opener?.isConnected) this.opener.focus();
  }
}
