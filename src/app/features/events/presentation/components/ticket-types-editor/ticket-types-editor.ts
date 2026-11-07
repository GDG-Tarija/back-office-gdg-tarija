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
import { PhaseAvailability } from '../../../domain/ticket-phase.model';
import { TicketType } from '../../../domain/ticket-type.model';
import {
  PhaseFormValue,
  TicketTypeFormValue,
  applyPhasePricesToQr,
  applyPriceToQr,
  emptyPhaseFormValue,
  emptyTicketTypeFormValue,
  enablePhases,
  formValueToPhaseInput,
  formValueToTicketTypeInput,
  movePhase,
  phaseDeleteBlockReason,
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
  /** Vendidos/restantes por fase (ticket_phase_id). */
  readonly availability = signal<Record<string, PhaseAvailability>>({});
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

  readonly soldByPhaseId = computed(() =>
    Object.fromEntries(Object.values(this.availability()).map((a) => [a.ticketPhaseId, a.sold])),
  );

  readonly validation = computed(() => {
    const editing = this.editing();
    return validateTicketType(formValueToTicketTypeInput(this.model()), {
      otherNames: this.tickets()
        .filter((t) => t.id !== editing?.id)
        .map((t) => t.name),
      registeredCount: editing ? this.editingCount() : undefined,
      originalPrice: editing?.price,
      existingPhases: editing?.phases.map((p) => ({ id: p.id, name: p.name, price: p.price })),
      soldByPhaseId: this.soldByPhaseId(),
    });
  });

  /** No se puede volver a "sin fases" si alguna fase guardada ya tiene ventas. */
  readonly disablePhasesBlockReason = computed(() => {
    const sold = this.soldByPhaseId();
    const withSales = (this.editing()?.phases ?? []).filter((p) => (sold[p.id] ?? 0) > 0);
    return withSales.length
      ? `No se puede quitar el sistema de fases: "${withSales[0].name}" ya tiene inscripciones.`
      : null;
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
          return;
        }
        // Cada fase gratuita descarta su QR, igual que el paquete.
        const { value: phased, discardedQrs } = applyPhasePricesToQr(value);
        if (discardedQrs.length) {
          discardedQrs.forEach((qr) => void this.cleanup.trackDiscarded(qr));
          this.model.set(phased);
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
      const [tickets, counts, availability] = await Promise.all([
        this.repo.list(this.eventId()),
        this.repo.getRegistrationCounts(this.eventId()),
        this.repo.getPhaseAvailability(this.eventId()),
      ]);
      this.tickets.set(tickets);
      this.counts.set(counts);
      this.availability.set(availability);
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

  phaseSold(phaseId: string | null): number {
    return phaseId ? (this.availability()[phaseId]?.sold ?? 0) : 0;
  }

  phaseAvailability(phaseId: string | null): PhaseAvailability | null {
    return phaseId ? (this.availability()[phaseId] ?? null) : null;
  }

  phaseDeleteBlockReason(phase: PhaseFormValue): string | null {
    return phaseDeleteBlockReason(this.phaseSold(phase.id));
  }

  /** Resumen "Preventa 12/50 · Normal 3" de las fases guardadas de un paquete. */
  phaseSummary(t: TicketType): { name: string; label: string; active: boolean }[] {
    return t.phases.map((p) => {
      const a = this.availability()[p.id];
      const sold = a?.sold ?? 0;
      return {
        name: p.name,
        label: p.capacity === null ? `${sold} vendidos` : `${sold}/${p.capacity}`,
        active: !!a?.isActive,
      };
    });
  }

  toggleUsesPhases(checked: boolean): void {
    if (checked) {
      this.model.update((v) => enablePhases(v));
      return;
    }
    if (this.disablePhasesBlockReason()) return;
    // Los QR de las fases desaparecen con ellas.
    for (const p of this.model().phases) {
      if (p.paymentQrUrl) void this.cleanup.trackDiscarded(p.paymentQrUrl);
    }
    this.model.update((v) => ({ ...v, usesPhases: false, phases: [] }));
  }

  addPhase(): void {
    this.model.update((v) => ({ ...v, phases: [...v.phases, emptyPhaseFormValue()] }));
  }

  removePhase(index: number): void {
    const phase = this.model().phases[index];
    if (!phase || this.phaseDeleteBlockReason(phase)) return;
    if (phase.paymentQrUrl) void this.cleanup.trackDiscarded(phase.paymentQrUrl);
    this.model.update((v) => ({ ...v, phases: v.phases.filter((_, i) => i !== index) }));
  }

  shiftPhase(index: number, direction: -1 | 1): void {
    this.model.update((v) => ({ ...v, phases: movePhase(v.phases, index, direction) }));
  }

  updatePhase(index: number, patch: Partial<Omit<PhaseFormValue, 'id'>>): void {
    this.model.update((v) => ({
      ...v,
      phases: v.phases.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  phasePriceIsPaid(phase: PhaseFormValue): boolean {
    const price = formValueToPhaseInput(phase).price;
    return !isNaN(price) && price > 0;
  }

  phaseError(index: number, field: 'name' | 'price' | 'capacity' | 'paymentQrUrl'): string | null {
    if (!this.submitted()) return null;
    return (
      this.validation().errors.find((e) => e.field === `phases[${index}].${field}`)?.message ?? null
    );
  }

  /** Errores de las fases que no pertenecen a una fila (vacío, fase con ventas quitada). */
  phasesError(): string | null {
    if (!this.submitted()) return null;
    return this.validation().errors.find((e) => e.field === 'phases')?.message ?? null;
  }

  phasesWarnings(): string[] {
    return this.validation()
      .warnings.filter((w) => w.field === 'phases')
      .map((w) => w.message);
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
      await this.refreshAvailability();
      this.dialogOpen.set(false);
      this.notice.set(editing ? 'Paquete actualizado.' : 'Paquete creado.');
    } catch (err) {
      this.dialogError.set(err instanceof Error ? err.message : 'No se pudo guardar el paquete.');
      // El guardado de fases no es transaccional: muestra lo que quedó realmente en la BD.
      await this.refreshQuietly();
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

  private async refreshAvailability(): Promise<void> {
    try {
      this.availability.set(await this.repo.getPhaseAvailability(this.eventId()));
    } catch {
      // Los contadores se actualizan en la próxima carga.
    }
  }

  /** Recarga paquetes y disponibilidad sin spinner; un fallo aquí no debe tapar el resultado. */
  private async refreshQuietly(): Promise<void> {
    try {
      const [tickets, availability] = await Promise.all([
        this.repo.list(this.eventId()),
        this.repo.getPhaseAvailability(this.eventId()),
      ]);
      this.tickets.set(tickets);
      this.availability.set(availability);
      this.ticketsChange.emit(tickets);
    } catch {
      // La lista queda como estaba; "Reintentar" recarga todo.
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
