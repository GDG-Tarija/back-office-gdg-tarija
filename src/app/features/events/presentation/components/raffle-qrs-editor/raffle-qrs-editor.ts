import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
// Signal Forms es experimental en Angular 21.2; ver nota en event-basics-form.
import { FormField, form } from '@angular/forms/signals';

import { InputTextModule } from 'primeng/inputtext';
import QRCode from 'qrcode';

import { publicEventUrl } from '../../../../../core/config/public-site';
import { FeedbackService } from '../../../../../core/services/feedback.service';
import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { focusField } from '../../../../../shared/utils/focus';
import { errorField, toUserMessage } from '../../../data/postgres-error.mapper';
import { slugify } from '../../../domain/event-validators';
import { RaffleQr, raffleQrNameError } from '../../../domain/raffle-qr.model';
import { RaffleQrsRepository } from '../../../domain/raffle-qrs.repository';

@Component({
  selector: 'app-raffle-qrs-editor',
  standalone: true,
  imports: [FormField, InputTextModule, DialogFrame],
  templateUrl: './raffle-qrs-editor.html',
})
export class RaffleQrsEditor implements OnInit {
  private readonly repo = inject(RaffleQrsRepository);
  private readonly feedback = inject(FeedbackService);

  readonly eventId = input.required<string>();
  readonly slug = input.required<string>();

  readonly qrs = signal<RaffleQr[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  /** Actividad cuyo QR se está encendiendo o apagando. */
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly editing = signal<RaffleQr | null>(null);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly dialogError = signal<string | null>(null);
  readonly model = signal({ name: '' });
  readonly f = form(this.model);
  private readonly baseline = signal('');
  readonly dirty = computed(() => this.model().name !== this.baseline());
  private readonly serverNameError = signal<string | null>(null);
  private readonly nameIssue = computed(() => {
    const editing = this.editing();
    return (
      this.serverNameError() ??
      raffleQrNameError(
        this.model().name,
        this.qrs()
          .filter((q) => q.activityId !== editing?.activityId)
          .map((q) => q.name),
      )
    );
  });
  readonly nameError = computed(() => (this.submitted() ? this.nameIssue() : null));

  private readonly viewingId = signal<string | null>(null);
  readonly viewing = computed(
    () => this.qrs().find((q) => q.activityId === this.viewingId()) ?? null,
  );
  readonly qrImage = signal<string | null>(null);
  readonly viewingUrl = computed(() => this.linkOf(this.viewing()));
  readonly fileName = computed(() => `qr-${slugify(this.viewing()?.name ?? '')}.png`);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.qrs.set(await this.repo.list(this.eventId()));
    } catch (err) {
      this.loadError.set(toUserMessage(err, 'No se pudieron cargar los QRs.', 'raffle_qr'));
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.openDialog(null);
  }

  openEdit(q: RaffleQr): void {
    this.openDialog(q);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.serverNameError.set(null);
    if (this.saving()) return;
    if (this.nameIssue()) {
      focusField('rq-name');
      return;
    }
    const name = this.model().name.trim();
    const editing = this.editing();
    this.saving.set(true);
    this.dialogError.set(null);
    try {
      if (editing) {
        await this.repo.rename(editing.activityId, name);
        this.qrs.update((list) =>
          list.map((q) => (q.activityId === editing.activityId ? { ...q, name } : q)),
        );
        this.dialogOpen.set(false);
        this.feedback.success('Nombre actualizado.');
      } else {
        const created = await this.repo.create(this.eventId(), name);
        this.qrs.update((list) => [...list, created]);
        this.dialogOpen.set(false);
        void this.openQr(created);
      }
    } catch (err) {
      const message = toUserMessage(err, 'No se pudo guardar el QR.', 'raffle_qr');
      if (errorField(err) === 'name') this.serverNameError.set(message);
      else this.dialogError.set(message);
      // Crear son dos pasos (actividad y QR): si falló el segundo, la lista muestra lo que quedó.
      if (!editing) void this.load();
    } finally {
      this.saving.set(false);
    }
  }

  /** Enciende o apaga el QR; a una actividad que no tenía le crea uno. */
  async toggle(q: RaffleQr): Promise<void> {
    if (this.togglingId()) return;
    this.togglingId.set(q.activityId);
    try {
      const saved = await this.repo.setActive(q, !q.active);
      this.qrs.update((list) => list.map((x) => (x.activityId === saved.activityId ? saved : x)));
      this.feedback.success(
        saved.active
          ? `QR de "${q.name}" encendido: ya suma tickets.`
          : `QR de "${q.name}" apagado: ya no suma tickets.`,
      );
    } catch (err) {
      this.feedback.error(toUserMessage(err, 'No se pudo cambiar el QR.', 'raffle_qr'));
    } finally {
      this.togglingId.set(null);
    }
  }

  async openQr(q: RaffleQr): Promise<void> {
    if (!q.code) return;
    this.qrImage.set(null);
    this.viewingId.set(q.activityId);
    // 1024 px: alcanza para imprimirlo en una hoja.
    this.qrImage.set(await QRCode.toDataURL(this.linkOf(q), { width: 1024, margin: 2 }));
  }

  closeQr(): void {
    this.viewingId.set(null);
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.viewingUrl());
      this.feedback.success('Link copiado al portapapeles.');
    } catch {
      this.feedback.error('No se pudo copiar. Selecciona el link y cópialo manualmente.');
    }
  }

  async remove(q: RaffleQr): Promise<void> {
    const ok = await this.feedback.confirm({
      titulo: 'Eliminar del sorteo',
      mensaje: `¿Eliminar "${q.name}"? Quienes ya sumaron este ticket lo pierden. Si solo quieres que el QR deje de sumar, apágalo.`,
      aceptar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await this.repo.delete(q.activityId);
      this.qrs.update((list) => list.filter((x) => x.activityId !== q.activityId));
      this.feedback.success('Eliminado del sorteo.');
    } catch (err) {
      this.feedback.error(toUserMessage(err, 'No se pudo eliminar.', 'raffle_qr'));
    }
  }

  /** Link que lleva el QR: abre la app de eventos y suma el ticket. */
  private linkOf(q: RaffleQr | null): string {
    return q?.code ? `${publicEventUrl(this.slug())}/qr/${q.code}` : '';
  }

  private openDialog(q: RaffleQr | null): void {
    const name = q?.name ?? '';
    this.editing.set(q);
    this.model.set({ name });
    this.baseline.set(name);
    this.submitted.set(false);
    this.serverNameError.set(null);
    this.dialogError.set(null);
    this.dialogOpen.set(true);
  }
}
