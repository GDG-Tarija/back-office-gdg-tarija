import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
// Signal Forms es experimental en Angular 21.2; ver nota en event-basics-form.
import { FormField, form } from '@angular/forms/signals';

import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { AssetCleanupTracker } from '../../../domain/asset-cleanup';
import { AssetsRepository } from '../../../domain/assets.repository';
import { validateTicketCapacities, validateTicketType } from '../../../domain/event-validators';
import { TicketType } from '../../../domain/ticket-type.model';
import {
  TicketTypeFormValue,
  applyPriceToQr,
  emptyTicketTypeFormValue,
  formValueToTicketTypeInput,
  ticketDeleteBlockReason,
  ticketTypeToFormValue,
} from '../../../domain/ticket-type-form';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';
import { ImageUploader } from '../image-uploader/image-uploader';

@Component({
  selector: 'app-ticket-types-editor',
  standalone: true,
  imports: [FormField, InputTextModule, TooltipModule, DialogFrame, ImageUploader],
  templateUrl: './ticket-types-editor.html',
})
export class TicketTypesEditor implements OnInit, OnDestroy {
  private readonly repo = inject(TicketTypesRepository);
  private readonly assets = inject(AssetsRepository);

  readonly eventId = input.required<string>();
  readonly eventCapacity = input.required<number>();

  /** Lista actualizada tras cargar o cambiar paquetes (alimenta el checklist de publicación). */
  readonly ticketsChange = output<TicketType[]>();

  readonly tickets = signal<TicketType[]>([]);
  readonly counts = signal<Record<string, number>>({});
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  // Diálogo de edición
  readonly dialogOpen = signal(false);
  readonly editing = signal<TicketType | null>(null);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly dialogError = signal<string | null>(null);
  readonly model = signal<TicketTypeFormValue>(emptyTicketTypeFormValue());
  readonly f = form(this.model);

  // Confirmación de borrado
  readonly toDelete = signal<TicketType | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  private cleanup = this.newTracker();

  readonly editingCount = computed(() => {
    const t = this.editing();
    return t ? (this.counts()[t.id] ?? 0) : 0;
  });

  readonly priceIsPaid = computed(() => {
    const price = formValueToTicketTypeInput(this.model()).price;
    return !isNaN(price) && price > 0;
  });

  readonly validation = computed(() => {
    const editing = this.editing();
    return validateTicketType(formValueToTicketTypeInput(this.model()), {
      otherNames: this.tickets()
        .filter((t) => t.id !== editing?.id)
        .map((t) => t.name),
      registeredCount: editing ? this.editingCount() : undefined,
      originalPrice: editing?.price,
    });
  });

  readonly capacityWarnings = computed(
    () => validateTicketCapacities(this.tickets(), this.eventCapacity()).warnings,
  );

  readonly canSave = computed(() => this.validation().errors.length === 0 && !this.saving());

  constructor() {
    // Precio 0 => sin QR (espejo del CHECK check_qr_for_paid_tickets).
    effect(() => {
      const value = this.model();
      untracked(() => {
        const { value: next, discardedQr } = applyPriceToQr(value);
        if (discardedQr) {
          void this.cleanup.trackDiscarded(discardedQr);
          this.model.set(next);
        }
      });
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    void this.cleanup.rollback();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [tickets, counts] = await Promise.all([
        this.repo.list(this.eventId()),
        this.repo.getRegistrationCounts(this.eventId()),
      ]);
      this.tickets.set(tickets);
      this.counts.set(counts);
      this.ticketsChange.emit(tickets);
    } catch (err) {
      this.loadError.set(
        err instanceof Error ? err.message : 'No se pudieron cargar los paquetes.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  registered(t: TicketType): number {
    return this.counts()[t.id] ?? 0;
  }

  deleteBlockReason(t: TicketType): string | null {
    return ticketDeleteBlockReason(this.registered(t));
  }

  fieldError(field: string): string | null {
    if (!this.submitted()) return null;
    return this.validation().errors.find((e) => e.field === field)?.message ?? null;
  }

  fieldWarning(field: string): string | null {
    return this.validation().warnings.find((w) => w.field === field)?.message ?? null;
  }

  openCreate(): void {
    this.openDialog(null, emptyTicketTypeFormValue());
  }

  openEdit(t: TicketType): void {
    this.openDialog(t, ticketTypeToFormValue(t));
  }

  async closeDialog(): Promise<void> {
    this.dialogOpen.set(false);
    await this.cleanup.rollback();
  }

  setImage(key: 'imageUrl' | 'paymentQrUrl', url: string | null): void {
    this.model.update((v) => ({ ...v, [key]: url }));
  }

  onImageUploaded(url: string): void {
    this.cleanup.trackUploaded(url);
  }

  onImageDiscarded(url: string): void {
    void this.cleanup.trackDiscarded(url);
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (!this.canSave()) return;
    const input = formValueToTicketTypeInput(this.model());
    this.saving.set(true);
    this.dialogError.set(null);
    try {
      const editing = this.editing();
      const saved = editing
        ? await this.repo.update(editing.id, input)
        : await this.repo.create(this.eventId(), input);
      this.tickets.update((list) =>
        editing ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved],
      );
      this.ticketsChange.emit(this.tickets());
      await this.cleanup.commit();
      this.dialogOpen.set(false);
      this.notice.set(editing ? 'Paquete actualizado.' : 'Paquete creado.');
    } catch (err) {
      this.dialogError.set(err instanceof Error ? err.message : 'No se pudo guardar el paquete.');
    } finally {
      this.saving.set(false);
    }
  }

  askDelete(t: TicketType): void {
    if (this.deleteBlockReason(t)) return;
    this.deleteError.set(null);
    this.toDelete.set(t);
  }

  cancelDelete(): void {
    this.toDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const t = this.toDelete();
    if (!t || this.deleteBlockReason(t)) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.repo.delete(t.id);
      this.tickets.update((list) => list.filter((x) => x.id !== t.id));
      this.ticketsChange.emit(this.tickets());
      // Ya borrado en BD: sus imágenes quedan huérfanas (mejor esfuerzo).
      const tracker = this.newTracker();
      for (const url of [t.imageUrl, t.paymentQrUrl]) {
        if (url) void tracker.trackDiscarded(url);
      }
      await tracker.commit();
      this.toDelete.set(null);
      this.notice.set('Paquete eliminado.');
    } catch (err) {
      // DomainError (p. ej. FK RESTRICT 23503) trae un mensaje legible.
      this.deleteError.set(err instanceof Error ? err.message : 'No se pudo eliminar el paquete.');
    } finally {
      this.deleting.set(false);
    }
  }

  private openDialog(ticket: TicketType | null, value: TicketTypeFormValue): void {
    this.cleanup = this.newTracker();
    this.editing.set(ticket);
    this.model.set(value);
    this.submitted.set(false);
    this.dialogError.set(null);
    this.notice.set(null);
    this.dialogOpen.set(true);
  }

  private newTracker(): AssetCleanupTracker {
    return new AssetCleanupTracker((url) => this.assets.remove(url));
  }
}
