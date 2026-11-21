import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { BsPipe } from '../../../../../shared/pipes/bs.pipe';
import { MOBILE_QUERY, mediaQuerySignal } from '../../../../../shared/utils/media-query';
import { toUserMessage } from '../../../data/postgres-error.mapper';
import {
  EMPTY_STORE_ORDER_FILTERS,
  StoreOrderFilters,
  StoreOrderStatusFilter,
  buyerName,
  computeStoreOrderStats,
  filterStoreOrders,
  hasActiveStoreOrderFilters,
  isRegistrationCancelled,
  sortStoreOrders,
  storeOrderStatusLabel,
  storeOrderStatusSeverity,
  totalUnits,
} from '../../../domain/store-orders';
import { STORE_ORDER_STATUS_OPTIONS, StoreOrder } from '../../../domain/store.model';
import { StoreOrdersRepository } from '../../../domain/store.repository';
import {
  StoreOrderDialog,
  StoreOrderStatusRequest,
} from '../store-order-dialog/store-order-dialog';

/** Compras de la tienda de un evento y su revisión de pago. */
@Component({
  selector: 'app-store-orders-panel',
  standalone: true,
  imports: [TableModule, TagModule, BsPipe, DatePipe, StoreOrderDialog],
  templateUrl: './store-orders-panel.html',
})
export class StoreOrdersPanel implements OnInit {
  private readonly repo = inject(StoreOrdersRepository);
  private readonly feedback = inject(FeedbackService);

  readonly eventId = input.required<string>();
  /** SUPERADMIN: la página ya está protegida, pero la UI no ofrece acciones sin permiso. */
  readonly canManage = input(false);

  /** Compras pendientes, para el contador de la pestaña. */
  readonly pendingChange = output<number>();

  readonly isMobile = mediaQuerySignal(MOBILE_QUERY);
  readonly statusOptions = STORE_ORDER_STATUS_OPTIONS;

  readonly orders = signal<StoreOrder[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly filters = signal<StoreOrderFilters>({ ...EMPTY_STORE_ORDER_FILTERS });

  readonly selectedId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly stats = computed(() => computeStoreOrderStats(this.orders()));
  readonly visible = computed(() =>
    sortStoreOrders(filterStoreOrders(this.orders(), this.filters())),
  );
  readonly hasFilters = computed(() => hasActiveStoreOrderFilters(this.filters()));
  readonly selected = computed(() => this.orders().find((o) => o.id === this.selectedId()) ?? null);
  /** Posición dentro de la lista filtrada (la cola de revisión). */
  readonly selectedIndex = computed(() =>
    this.visible().findIndex((o) => o.id === this.selectedId()),
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.orders.set(await this.repo.list(this.eventId()));
      this.pendingChange.emit(this.stats().pending);
    } catch (err) {
      this.loadError.set(toUserMessage(err, 'No se pudieron cargar las compras.', 'store_order'));
    } finally {
      this.loading.set(false);
    }
  }

  buyer(o: StoreOrder): string {
    return buyerName(o);
  }

  units(o: StoreOrder): number {
    return totalUnits(o);
  }

  itemsSummary(o: StoreOrder): string {
    return o.items.map((i) => `${i.productName} × ${i.quantity}`).join(', ');
  }

  statusLabel(o: StoreOrder): string {
    return storeOrderStatusLabel(o.status);
  }

  statusSeverity(o: StoreOrder): ReturnType<typeof storeOrderStatusSeverity> {
    return storeOrderStatusSeverity(o.status);
  }

  registrationCancelled(o: StoreOrder): boolean {
    return isRegistrationCancelled(o);
  }

  countFor(status: StoreOrderStatusFilter): number {
    const s = this.stats();
    return status === 'ALL'
      ? s.total
      : status === 'PENDING'
        ? s.pending
        : status === 'PAID'
          ? s.paid
          : s.cancelled;
  }

  setStatusFilter(status: StoreOrderStatusFilter): void {
    this.filters.update((f) => ({ ...f, status }));
  }

  setSearch(search: string): void {
    this.filters.update((f) => ({ ...f, search }));
  }

  clearFilters(): void {
    this.filters.set({ ...EMPTY_STORE_ORDER_FILTERS });
  }

  open(o: StoreOrder): void {
    this.actionError.set(null);
    this.selectedId.set(o.id);
  }

  close(): void {
    if (this.busy()) return;
    this.selectedId.set(null);
    this.actionError.set(null);
  }

  step(direction: -1 | 1): void {
    const list = this.visible();
    const next = list[this.selectedIndex() + direction];
    if (next) this.open(next);
  }

  async changeStatus(request: StoreOrderStatusRequest): Promise<void> {
    if (!this.canManage() || this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const saved = await this.repo.setStatus(request.order.id, request.status, request.reason);
      this.orders.update((list) => list.map((o) => (o.id === saved.id ? saved : o)));
      this.pendingChange.emit(this.stats().pending);
      this.feedback.success(
        request.status === 'PAID'
          ? 'Compra marcada como pagada.'
          : request.status === 'CANCELLED'
            ? 'Compra anulada.'
            : 'La compra volvió a pendiente.',
      );
    } catch (err) {
      this.actionError.set(
        toUserMessage(err, 'No se pudo cambiar el estado de la compra.', 'store_order'),
      );
      // Otra persona pudo haberla cambiado: se muestra el estado real.
      await this.refreshQuietly();
    } finally {
      this.busy.set(false);
    }
  }

  private async refreshQuietly(): Promise<void> {
    try {
      this.orders.set(await this.repo.list(this.eventId()));
      this.pendingChange.emit(this.stats().pending);
    } catch {
      // La lista queda como estaba; "Reintentar" recarga todo.
    }
  }
}
