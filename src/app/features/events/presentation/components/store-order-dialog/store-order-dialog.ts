import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

import { BsPipe } from '../../../../../shared/pipes/bs.pipe';
import { toUserMessage } from '../../../data/postgres-error.mapper';
import { registrationStatusLabel } from '../../../domain/registration-status';
import { isPdfPath } from '../../../domain/store-asset-path';
import {
  CORRECTION_REASON_MAX,
  CORRECTION_REASON_MIN,
  buyerName,
  correctionBlockReason,
  correctionReasonError,
  isRegistrationCancelled,
  markPaidBlockReason,
  optionalReasonError,
  storeOrderStatusLabel,
  storeOrderStatusSeverity,
  totalUnits,
} from '../../../domain/store-orders';
import { StoreOrder, StoreOrderHistoryEntry, StoreOrderStatus } from '../../../domain/store.model';
import { StoreOrdersRepository } from '../../../domain/store.repository';

export type StoreOrderAction = 'paid' | 'cancel' | 'correct' | null;
export type ProofState = 'loading' | 'ready' | 'error';

export interface StoreOrderStatusRequest {
  order: StoreOrder;
  status: StoreOrderStatus;
  reason: string | null;
}

/**
 * Detalle de una compra con su comprobante privado (URL firmada), ítems e historial. Las acciones
 * (marcar pagada, anular, corregir) se confirman aquí y las ejecuta el padre (`changeStatus`).
 */
@Component({
  selector: 'app-store-order-dialog',
  standalone: true,
  imports: [DialogModule, TagModule, BsPipe, DatePipe],
  templateUrl: './store-order-dialog.html',
})
export class StoreOrderDialog {
  private readonly repo = inject(StoreOrdersRepository);
  private readonly destroyRef = inject(DestroyRef);

  /** Compra a revisar; null = cerrado. */
  readonly order = input<StoreOrder | null>(null);
  readonly position = input(1);
  readonly total = input(1);
  /** Solo SUPERADMIN revisa (la RPC y la RLS lo imponen igual). */
  readonly canManage = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly closed = output<void>();
  readonly previous = output<void>();
  readonly next = output<void>();
  readonly changeStatus = output<StoreOrderStatusRequest>();

  readonly reasonMin = CORRECTION_REASON_MIN;
  readonly reasonMax = CORRECTION_REASON_MAX;

  readonly proofUrl = signal<string | null>(null);
  readonly proofState = signal<ProofState>('loading');
  readonly proofError = signal<string | null>(null);
  readonly imageFailed = signal(false);
  readonly openError = signal<string | null>(null);

  readonly history = signal<StoreOrderHistoryEntry[]>([]);
  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);

  readonly action = signal<StoreOrderAction>(null);
  readonly reason = signal('');
  readonly reasonTouched = signal(false);

  readonly isPdf = computed(() => isPdfPath(this.order()?.paymentProofPath));
  readonly name = computed(() => {
    const o = this.order();
    return o ? buyerName(o) : '';
  });
  readonly units = computed(() => {
    const o = this.order();
    return o ? totalUnits(o) : 0;
  });
  readonly statusLabel = computed(() => storeOrderStatusLabel(this.order()?.status));
  readonly statusSeverity = computed(() => storeOrderStatusSeverity(this.order()?.status));
  readonly registrationCancelled = computed(() => {
    const o = this.order();
    return !!o && isRegistrationCancelled(o);
  });
  readonly registrationLabel = computed(() =>
    registrationStatusLabel(this.order()?.registrationStatus ?? ''),
  );
  readonly isPending = computed(() => this.order()?.status === 'PENDING');
  readonly paidBlockReason = computed(() => {
    const o = this.order();
    return o ? markPaidBlockReason(o) : null;
  });
  readonly correctionBlock = computed(() => {
    const o = this.order();
    return o ? correctionBlockReason(o) : null;
  });
  readonly hasPrev = computed(() => this.position() > 1);
  readonly hasNext = computed(() => this.position() < this.total());

  readonly reasonError = computed(() => {
    const action = this.action();
    if (action === 'correct') return correctionReasonError(this.reason());
    if (action === 'cancel') return optionalReasonError(this.reason());
    return null;
  });
  readonly showReasonError = computed(() => this.reasonTouched() && !!this.reasonError());

  private loadToken = 0;
  private lastKey = '';
  private lastFocused: HTMLElement | null = null;
  private wasOpen = false;

  constructor() {
    // Nueva compra o nuevo estado: se reinicia la acción y se recargan comprobante e historial.
    effect(() => {
      const o = this.order();
      const key = o ? `${o.id}|${o.status}` : '';
      if (key === this.lastKey) return;
      const sameOrder = !!o && this.lastKey.startsWith(`${o.id}|`);
      this.lastKey = key;
      untracked(() => {
        this.resetAction();
        if (!o) return;
        if (!sameOrder) void this.loadProof(o);
        void this.loadHistory(o.id);
      });
    });

    // Devuelve el foco a lo que abrió el diálogo.
    effect(() => {
      const open = !!this.order();
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

  async loadProof(order: StoreOrder = this.order()!): Promise<void> {
    if (!order) return;
    const token = ++this.loadToken;
    this.proofState.set('loading');
    this.proofError.set(null);
    this.imageFailed.set(false);
    this.openError.set(null);
    this.proofUrl.set(null);
    try {
      const url = await this.repo.getProofUrl(order.paymentProofPath);
      if (token !== this.loadToken) return;
      this.proofUrl.set(url);
      this.proofState.set('ready');
    } catch (err) {
      if (token !== this.loadToken) return;
      this.proofState.set('error');
      this.proofError.set(toUserMessage(err, 'No se pudo abrir el comprobante.', 'store_order'));
    }
  }

  /** La URL firmada vence a los 10 min: se pide una nueva al abrir (un PDF solo se ve así). */
  async openProofInTab(): Promise<void> {
    const order = this.order();
    if (!order) return;
    this.openError.set(null);
    // La pestaña se abre dentro del clic para que el navegador no la bloquee.
    const tab = window.open('', '_blank');
    if (!tab) {
      this.openError.set('El navegador bloqueó la pestaña nueva. Permite ventanas emergentes.');
      return;
    }
    tab.opener = null;
    try {
      tab.location.href = await this.repo.getProofUrl(order.paymentProofPath);
    } catch (err) {
      tab.close();
      this.openError.set(toUserMessage(err, 'No se pudo abrir el comprobante.', 'store_order'));
    }
  }

  async loadHistory(orderId: string): Promise<void> {
    this.historyLoading.set(true);
    this.historyError.set(null);
    try {
      const entries = await this.repo.getHistory(orderId);
      if (this.order()?.id === orderId) this.history.set(entries);
    } catch (err) {
      if (this.order()?.id === orderId) {
        this.history.set([]);
        this.historyError.set(toUserMessage(err, 'No se pudo cargar el historial.', 'store_order'));
      }
    } finally {
      this.historyLoading.set(false);
    }
  }

  historyStatusLabel(status: StoreOrderStatus | null): string {
    return status ? storeOrderStatusLabel(status) : 'Creada';
  }

  onImageError(): void {
    this.imageFailed.set(true);
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) this.closed.emit();
  }

  goPrevious(): void {
    if (this.hasPrev() && !this.busy()) this.previous.emit();
  }

  goNext(): void {
    if (this.hasNext() && !this.busy()) this.next.emit();
  }

  /** ← / → cambian de compra salvo que el foco esté en un campo de texto. */
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

  startAction(action: Exclude<StoreOrderAction, null>): void {
    if (!this.canManage() || this.busy()) return;
    if (action === 'paid' && this.paidBlockReason()) return;
    if (action === 'cancel' && !this.isPending()) return;
    if (action === 'correct' && this.correctionBlock()) return;
    this.action.set(action);
    this.reason.set('');
    this.reasonTouched.set(false);
    setTimeout(() =>
      document.getElementById(action === 'paid' ? 'order-confirm-btn' : 'order-reason')?.focus(),
    );
  }

  resetAction(): void {
    this.action.set(null);
    this.reason.set('');
    this.reasonTouched.set(false);
  }

  onReasonInput(value: string): void {
    this.reason.set(value);
  }

  submitAction(): void {
    const order = this.order();
    const action = this.action();
    if (!order || !action || !this.canManage() || this.busy()) return;
    this.reasonTouched.set(true);
    if (this.reasonError()) {
      document.getElementById('order-reason')?.focus();
      return;
    }
    const reason = this.reason().trim() || null;
    const status: StoreOrderStatus =
      action === 'paid' ? 'PAID' : action === 'cancel' ? 'CANCELLED' : 'PENDING';
    this.changeStatus.emit({ order, status, reason: action === 'paid' ? null : reason });
  }
}
