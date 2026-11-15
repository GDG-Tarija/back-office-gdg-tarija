import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

import { BsPipe } from '../../../../../shared/pipes/bs.pipe';
import { attendeeFullName, entryLabel, isImageProof } from '../../../domain/attendee-payment';
import { Attendee } from '../../../domain/event.model';
import {
  REGISTRATION_STATUS_OPTIONS,
  RegistrationStatus,
  StatusOption,
  parseRegistrationStatus,
  registrationStatusLabel,
  registrationStatusSeverity,
} from '../../../domain/registration-status';

export type ProofImageState = 'loading' | 'loaded' | 'error';

export interface ProofStatusChange {
  attendee: Attendee;
  status: RegistrationStatus;
}

// Orden de los botones: lo destructivo a la izquierda, confirmar el pago siempre al final.
const ACTION_ORDER: readonly RegistrationStatus[] = ['CANCELLED', 'PENDING', 'CONFIRMED'];

export const ZOOM_STEPS: readonly number[] = [1, 1.5, 2, 3];

/** Visor del comprobante de pago con la información para compararlo y acciones de revisión. */
@Component({
  selector: 'app-payment-proof-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule, TagModule, BsPipe, DatePipe],
  templateUrl: './payment-proof-dialog.html',
})
export class PaymentProofDialog {
  private readonly destroyRef = inject(DestroyRef);

  /** Inscripción a revisar; null = diálogo cerrado. */
  readonly attendee = input<Attendee | null>(null);
  /** Posición dentro de la cola de revisión (1-based). */
  readonly position = input<number>(1);
  readonly total = input<number>(1);
  /** Solo SUPERADMIN confirma o anula (RLS sigue siendo la seguridad real). */
  readonly canManage = input<boolean>(false);
  readonly busy = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly closed = output<void>();
  readonly previous = output<void>();
  readonly next = output<void>();
  /** Ya confirmado dentro del visor: quien lo recibe no vuelve a preguntar. */
  readonly statusChange = output<ProofStatusChange>();

  readonly imageState = signal<ProofImageState>('loading');
  /** Índice en ZOOM_STEPS; 0 = ajustado a la ventana. */
  readonly zoomIndex = signal(0);
  /** Estado al que se quiere pasar, mientras se pide la confirmación. */
  readonly pendingAction = signal<RegistrationStatus | null>(null);

  readonly proofUrl = computed(() => this.attendee()?.paymentProofUrl ?? null);
  readonly isImage = computed(() => isImageProof(this.proofUrl()));
  /** Si la imagen no carga se ofrece el enlace, igual que con un PDF. */
  readonly showImage = computed(() => this.isImage() && this.imageState() !== 'error');
  readonly zoom = computed(() => ZOOM_STEPS[this.zoomIndex()]);
  readonly canZoomIn = computed(() => this.zoomIndex() < ZOOM_STEPS.length - 1);
  readonly canZoomOut = computed(() => this.zoomIndex() > 0);
  readonly hasPrev = computed(() => this.position() > 1);
  readonly hasNext = computed(() => this.position() < this.total());

  readonly name = computed(() => {
    const a = this.attendee();
    return a ? attendeeFullName(a) : '';
  });
  readonly entry = computed(() => {
    const a = this.attendee();
    return a ? entryLabel(a) : '';
  });
  readonly statusLabel = computed(() => registrationStatusLabel(this.attendee()?.status));
  readonly statusSeverity = computed(() => registrationStatusSeverity(this.attendee()?.status));
  readonly currentStatus = computed(() => parseRegistrationStatus(this.attendee()?.status));
  readonly isPending = computed(() => this.currentStatus() === 'PENDING');
  readonly canAct = computed(() => this.canManage() && this.currentStatus() !== null);
  /** Los otros dos estados: confirmar o desestimar el pago, anular o restaurar. */
  readonly actions = computed<StatusOption<RegistrationStatus>[]>(() => {
    const current = this.currentStatus();
    if (!this.canAct()) return [];
    return ACTION_ORDER.filter((s) => s !== current).map(
      (s) => REGISTRATION_STATUS_OPTIONS.find((o) => o.value === s)!,
    );
  });

  private lastFocused: HTMLElement | null = null;
  private wasOpen = false;
  private lastKey = '';
  private lastStatus: RegistrationStatus | null = null;

  constructor() {
    // Al cambiar de inscripción (o url) se reinicia el visor y la confirmación en curso.
    effect(() => {
      const key = `${this.attendee()?.id}|${this.proofUrl()}`;
      if (key === this.lastKey) return;
      this.lastKey = key;
      this.imageState.set('loading');
      this.zoomIndex.set(0);
      this.pendingAction.set(null);
    });

    // Si el estado cambió (guardado o desde otra pantalla), la confirmación en curso ya no aplica.
    effect(() => {
      const status = this.currentStatus();
      if (status === this.lastStatus) return;
      this.lastStatus = status;
      this.pendingAction.set(null);
    });

    // Devuelve el foco al elemento que abrió el visor.
    effect(() => {
      const open = !!this.attendee();
      if (open && !this.wasOpen) {
        this.lastFocused = document.activeElement as HTMLElement | null;
      } else if (!open && this.wasOpen) {
        const target = this.lastFocused;
        this.lastFocused = null;
        setTimeout(() => target?.isConnected && target.focus());
      }
      this.wasOpen = open;
    });

    this.destroyRef.onDestroy(() => (this.lastFocused = null));
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) this.closed.emit();
  }

  onImageLoad(): void {
    this.imageState.set('loaded');
  }

  onImageError(): void {
    this.imageState.set('error');
  }

  zoomIn(): void {
    if (this.canZoomIn()) this.zoomIndex.update((i) => i + 1);
  }

  zoomOut(): void {
    if (this.canZoomOut()) this.zoomIndex.update((i) => i - 1);
  }

  resetZoom(): void {
    this.zoomIndex.set(0);
  }

  goPrevious(): void {
    if (this.hasPrev() && !this.busy()) this.previous.emit();
  }

  goNext(): void {
    if (this.hasNext() && !this.busy()) this.next.emit();
  }

  /** ← / → navegan entre comprobantes salvo que el foco esté en un campo de texto. */
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.goPrevious();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.goNext();
    }
  }

  startAction(status: RegistrationStatus): void {
    if (this.canAct() && status !== this.currentStatus()) this.pendingAction.set(status);
  }

  dismissAction(): void {
    this.pendingAction.set(null);
  }

  runAction(): void {
    const attendee = this.attendee();
    const status = this.pendingAction();
    if (!attendee || !status || !this.canAct() || status === this.currentStatus()) return;
    this.statusChange.emit({ attendee, status });
  }

  /** Estilo del botón según a dónde lleva: confirmar es la acción principal, anular la peligrosa. */
  actionClass(status: RegistrationStatus): string {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-action text-on-action hover:bg-action-hover';
      case 'CANCELLED':
        return 'border border-danger-text text-danger-text hover:bg-error-bg';
      default:
        return 'border border-black/15 text-text-primary hover:bg-neutral-100 dark:border-white/20 dark:text-neutral-100 dark:hover:bg-neutral-800';
    }
  }
}
