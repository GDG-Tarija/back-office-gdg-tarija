import {
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { StoreImagesApi } from '../../../data/store-images.api';
import { StoreOrdersApi } from '../../../data/store-orders.api';
import { StoreProductsApi } from '../../../data/store-products.api';
import { Event } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import {
  StoreImagesRepository,
  StoreOrdersRepository,
  StoreProductsRepository,
} from '../../../domain/store.repository';
import { EventHeader } from '../../components/event-header/event-header';
import { StoreOrdersPanel } from '../../components/store-orders-panel/store-orders-panel';
import { StoreProductsEditor } from '../../components/store-products-editor/store-products-editor';
import { EVENT_PAGE_PROVIDERS } from '../event-workspace/event-workspace';

export type StoreView = 'productos' | 'compras';

export const STORE_VIEWS: readonly { id: StoreView; label: string; icon: string }[] = [
  { id: 'productos', label: 'Productos', icon: 'inventory_2' },
  { id: 'compras', label: 'Compras', icon: 'receipt_long' },
];

export function parseStoreView(value: string | null | undefined): StoreView {
  return value === 'compras' ? 'compras' : 'productos';
}

/** Tienda del evento (issue #6): productos con galería, QR de pago y revisión de compras. */
@Component({
  selector: 'app-store-page',
  standalone: true,
  imports: [EventHeader, StoreProductsEditor, StoreOrdersPanel],
  providers: [
    ...EVENT_PAGE_PROVIDERS,
    { provide: StoreProductsRepository, useClass: StoreProductsApi },
    { provide: StoreOrdersRepository, useClass: StoreOrdersApi },
    { provide: StoreImagesRepository, useClass: StoreImagesApi },
  ],
  templateUrl: './store-page.html',
})
export class StorePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly auth = inject(AuthService);

  readonly views = STORE_VIEWS;
  readonly event = signal<Event | null>(null);
  readonly loading = signal(true);
  readonly errorMsg = signal<string | null>(null);
  readonly view = signal<StoreView>(parseStoreView(this.route.snapshot.queryParamMap.get('vista')));
  readonly pending = signal<number | null>(null);
  readonly readiness = signal<{ hasQr: boolean; activeProducts: number } | null>(null);
  readonly canManage = computed(() => this.auth.role() === 'SUPERADMIN');

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) void this.load(id);
    else {
      this.errorMsg.set('Identificador de evento no válido.');
      this.loading.set(false);
    }
  }

  async load(eventId: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const event = await this.eventsRepo.getEventById(eventId);
      if (!event) this.errorMsg.set('El evento solicitado no existe o fue eliminado.');
      else this.event.set(event);
    } catch {
      this.errorMsg.set('Ocurrió un error al cargar la tienda. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  selectView(view: StoreView): void {
    this.view.set(view);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vista: view === 'productos' ? null : view },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Pestañas ARIA: flechas, Inicio y Fin cambian de vista. */
  onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = this.views.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % this.views.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + this.views.length) % this.views.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    this.selectView(this.views[target].id);
    this.tabButtons()[target]?.nativeElement.focus();
  }

  goBack(): void {
    void this.router.navigate(['/events']);
  }
}
