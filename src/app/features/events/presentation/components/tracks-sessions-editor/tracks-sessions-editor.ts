import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
// Signal Forms es experimental en Angular 21.2; ver nota en event-basics-form.
import { FormField, form } from '@angular/forms/signals';

import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { SessionsApi } from '../../../data/sessions.api';
import { SessionRegistrationsApi } from '../../../data/session-registrations.api';
import { TracksApi } from '../../../data/tracks.api';
import { AssetCleanupTracker } from '../../../domain/asset-cleanup';
import { AssetsRepository } from '../../../domain/assets.repository';
import { Event } from '../../../domain/event.model';
import {
  SessionSlot,
  ValidationIssue,
  findSessionOverlaps,
  fromLaPaz,
  validateSession,
  validateTrack,
} from '../../../domain/event-validators';
import {
  SessionFormValue,
  emptySessionFormValue,
  findSameStartPairs,
  formValueToSessionInput,
  groupAgenda,
  sessionCapacityWarning,
  sessionDeleteBlockReason,
  sessionToFormValue,
  trackDeleteMessage,
  validateSessionCapacityFloor,
} from '../../../domain/session-form';
import { SessionRegistrationsRepository } from '../../../domain/session-registrations.repository';
import { SESSION_LEVELS, Session } from '../../../domain/session.model';
import { SessionsRepository } from '../../../domain/sessions.repository';
import { Track } from '../../../domain/track.model';
import { TracksRepository } from '../../../domain/tracks.repository';
import { ImageUploader } from '../image-uploader/image-uploader';

interface TrackFormValue {
  name: string;
  description: string;
}

/** Evento mínimo que necesita el editor (rango de fechas en La Paz y capacidad). */
export type TracksSessionsEvent = Pick<Event, 'dateStart' | 'dateEnd' | 'capacity'>;

@Component({
  selector: 'app-tracks-sessions-editor',
  standalone: true,
  imports: [FormField, InputTextModule, TooltipModule, DialogFrame, ImageUploader],
  providers: [
    { provide: TracksRepository, useClass: TracksApi },
    { provide: SessionsRepository, useClass: SessionsApi },
    { provide: SessionRegistrationsRepository, useClass: SessionRegistrationsApi },
  ],
  templateUrl: './tracks-sessions-editor.html',
})
export class TracksSessionsEditor implements OnInit, OnDestroy {
  private readonly tracksRepo = inject(TracksRepository);
  private readonly sessionsRepo = inject(SessionsRepository);
  private readonly registrationsRepo = inject(SessionRegistrationsRepository);
  private readonly assets = inject(AssetsRepository);

  readonly eventId = input.required<string>();
  readonly event = input.required<TracksSessionsEvent>();

  /** Lista actualizada tras cargar o cambiar sesiones (alimenta el checklist de publicación). */
  readonly sessionsChange = output<Session[]>();

  readonly levels = SESSION_LEVELS;

  readonly tracks = signal<Track[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly counts = signal<Record<string, number>>({});
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly agenda = computed(() => groupAgenda(this.sessions(), this.tracks()));
  readonly trackName = computed(() => {
    const map = new Map(this.tracks().map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? (map.get(id) ?? null) : null);
  });

  readonly overlapWarnings = computed(() => {
    const slots: SessionSlot[] = this.sessions();
    const label = (s: SessionSlot) => `"${s.title}" (${s.startTime}-${s.endTime})`;
    const overlaps = findSessionOverlaps(slots).map(
      ([a, b]) => `${label(a)} y ${label(b)} se solapan en el mismo track.`,
    );
    const sameStart = findSameStartPairs(slots).map(
      ([a, b]) =>
        `${label(a)} y ${label(b)} empiezan a la misma hora: una misma persona no podrá inscribirse en ambas.`,
    );
    return [...overlaps, ...sameStart];
  });

  // --- Tracks ---
  readonly trackDialogOpen = signal(false);
  readonly editingTrack = signal<Track | null>(null);
  readonly trackModel = signal<TrackFormValue>({ name: '', description: '' });
  readonly tf = form(this.trackModel);
  readonly trackSubmitted = signal(false);
  readonly trackSaving = signal(false);
  readonly trackDialogError = signal<string | null>(null);

  readonly trackValidation = computed(() =>
    validateTrack(
      { name: this.trackModel().name },
      {
        otherNames: this.tracks()
          .filter((t) => t.id !== this.editingTrack()?.id)
          .map((t) => t.name),
      },
    ),
  );

  readonly trackToDelete = signal<Track | null>(null);
  readonly trackDeleting = signal(false);
  readonly trackDeleteError = signal<string | null>(null);
  readonly trackDeleteSessionCount = computed(() => {
    const t = this.trackToDelete();
    return t ? this.sessions().filter((s) => s.trackId === t.id).length : 0;
  });
  readonly trackDeleteText = computed(() => {
    const t = this.trackToDelete();
    return t ? trackDeleteMessage(t, this.trackDeleteSessionCount()) : '';
  });

  // --- Sesiones ---
  readonly sessionDialogOpen = signal(false);
  readonly editingSession = signal<Session | null>(null);
  readonly sessionModel = signal<SessionFormValue>(emptySessionFormValue());
  readonly sf = form(this.sessionModel);
  readonly sessionSubmitted = signal(false);
  readonly sessionSaving = signal(false);
  readonly sessionDialogError = signal<string | null>(null);

  readonly sessionToDelete = signal<Session | null>(null);
  readonly sessionDeleting = signal(false);
  readonly sessionDeleteError = signal<string | null>(null);

  private cleanup = this.newTracker();

  readonly editingRegistered = computed(() => {
    const s = this.editingSession();
    return s ? (this.counts()[s.id] ?? 0) : 0;
  });

  readonly sessionValidation = computed(() => {
    const editing = this.editingSession();
    const input = formValueToSessionInput(this.sessionModel());
    const ev = this.event();
    const r = validateSession(input, {
      eventStart: ev.dateStart,
      eventEnd: ev.dateEnd,
      eventTrackIds: this.tracks().map((t) => t.id),
      otherSessions: this.sessions(),
      selfId: editing?.id,
    });
    const errors: ValidationIssue[] = [...r.errors];
    const warnings: ValidationIssue[] = [...r.warnings];
    if (editing) {
      const floor = validateSessionCapacityFloor(input.capacity, this.editingRegistered());
      if (floor) errors.push(floor);
    }
    const capWarn = sessionCapacityWarning(input.capacity, ev.capacity);
    if (capWarn) warnings.push(capWarn);
    return { errors, warnings };
  });

  readonly canSaveSession = computed(
    () => this.sessionValidation().errors.length === 0 && !this.sessionSaving(),
  );

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
      const [tracks, sessions] = await Promise.all([
        this.tracksRepo.list(this.eventId()),
        this.sessionsRepo.list(this.eventId()),
      ]);
      const counts = await this.registrationsRepo.getCounts(sessions.map((s) => s.id));
      this.tracks.set(tracks);
      this.sessions.set(sessions);
      this.counts.set(counts);
      this.sessionsChange.emit(sessions);
    } catch (err) {
      this.loadError.set(
        err instanceof Error ? err.message : 'No se pudieron cargar los tracks y sesiones.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  registered(s: Session): number {
    return this.counts()[s.id] ?? 0;
  }

  deleteBlockReason(s: Session): string | null {
    return sessionDeleteBlockReason(this.registered(s));
  }

  // ---------------------------------------------------------------- Tracks

  trackFieldError(): string | null {
    if (!this.trackSubmitted()) return null;
    return this.trackValidation().errors[0]?.message ?? null;
  }

  openCreateTrack(): void {
    this.openTrackDialog(null, { name: '', description: '' });
  }

  openEditTrack(t: Track): void {
    this.openTrackDialog(t, { name: t.name, description: t.description ?? '' });
  }

  closeTrackDialog(): void {
    this.trackDialogOpen.set(false);
  }

  async saveTrack(): Promise<void> {
    this.trackSubmitted.set(true);
    if (this.trackValidation().errors.length > 0 || this.trackSaving()) return;
    const v = this.trackModel();
    const input = { name: v.name.trim(), description: v.description.trim() || null };
    this.trackSaving.set(true);
    this.trackDialogError.set(null);
    try {
      const editing = this.editingTrack();
      const saved = editing
        ? await this.tracksRepo.update(editing.id, input)
        : await this.tracksRepo.create(this.eventId(), input);
      this.tracks.update((list) =>
        editing ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved],
      );
      this.trackDialogOpen.set(false);
      this.notice.set(editing ? 'Track actualizado.' : 'Track creado.');
    } catch (err) {
      this.trackDialogError.set(
        err instanceof Error ? err.message : 'No se pudo guardar el track.',
      );
    } finally {
      this.trackSaving.set(false);
    }
  }

  askDeleteTrack(t: Track): void {
    this.trackDeleteError.set(null);
    this.trackToDelete.set(t);
  }

  cancelDeleteTrack(): void {
    this.trackToDelete.set(null);
  }

  async confirmDeleteTrack(): Promise<void> {
    const t = this.trackToDelete();
    if (!t) return;
    this.trackDeleting.set(true);
    this.trackDeleteError.set(null);
    try {
      await this.tracksRepo.delete(t.id);
      this.tracks.update((list) => list.filter((x) => x.id !== t.id));
      // ON DELETE SET NULL: las sesiones quedan sin track.
      const affected = this.trackDeleteSessionCount();
      this.sessions.update((list) =>
        list.map((s) => (s.trackId === t.id ? { ...s, trackId: null } : s)),
      );
      if (affected > 0) this.sessionsChange.emit(this.sessions());
      this.trackToDelete.set(null);
      this.notice.set(
        affected > 0
          ? `Track eliminado. ${affected} sesión(es) quedaron sin track.`
          : 'Track eliminado.',
      );
    } catch (err) {
      this.trackDeleteError.set(
        err instanceof Error ? err.message : 'No se pudo eliminar el track.',
      );
    } finally {
      this.trackDeleting.set(false);
    }
  }

  private openTrackDialog(track: Track | null, value: TrackFormValue): void {
    this.editingTrack.set(track);
    this.trackModel.set(value);
    this.trackSubmitted.set(false);
    this.trackDialogError.set(null);
    this.notice.set(null);
    this.trackDialogOpen.set(true);
  }

  // -------------------------------------------------------------- Sesiones

  sessionFieldError(field: string): string | null {
    if (!this.sessionSubmitted()) return null;
    return this.sessionValidation().errors.find((e) => e.field === field)?.message ?? null;
  }

  sessionFieldWarning(field: string): string | null {
    return this.sessionValidation().warnings.find((w) => w.field === field)?.message ?? null;
  }

  openCreateSession(): void {
    this.openSessionDialog(null, emptySessionFormValue(fromLaPaz(this.event().dateStart).date));
  }

  openEditSession(s: Session): void {
    this.openSessionDialog(s, sessionToFormValue(s));
  }

  async closeSessionDialog(): Promise<void> {
    this.sessionDialogOpen.set(false);
    await this.cleanup.rollback();
  }

  setAvatar(url: string | null): void {
    this.sessionModel.update((v) => ({ ...v, speakerAvatarUrl: url }));
  }

  onAvatarUploaded(url: string): void {
    this.cleanup.trackUploaded(url);
  }

  onAvatarDiscarded(url: string): void {
    void this.cleanup.trackDiscarded(url);
  }

  async saveSession(): Promise<void> {
    this.sessionSubmitted.set(true);
    if (!this.canSaveSession()) return;
    const input = formValueToSessionInput(this.sessionModel());
    this.sessionSaving.set(true);
    this.sessionDialogError.set(null);
    try {
      const editing = this.editingSession();
      const saved = editing
        ? await this.sessionsRepo.update(editing.id, input)
        : await this.sessionsRepo.create(this.eventId(), input);
      this.sessions.update((list) =>
        editing ? list.map((s) => (s.id === saved.id ? saved : s)) : [...list, saved],
      );
      this.sessionsChange.emit(this.sessions());
      await this.cleanup.commit();
      this.sessionDialogOpen.set(false);
      this.notice.set(editing ? 'Sesión actualizada.' : 'Sesión creada.');
    } catch (err) {
      this.sessionDialogError.set(
        err instanceof Error ? err.message : 'No se pudo guardar la sesión.',
      );
    } finally {
      this.sessionSaving.set(false);
    }
  }

  askDeleteSession(s: Session): void {
    if (this.deleteBlockReason(s)) return;
    this.sessionDeleteError.set(null);
    this.sessionToDelete.set(s);
  }

  cancelDeleteSession(): void {
    this.sessionToDelete.set(null);
  }

  async confirmDeleteSession(): Promise<void> {
    const s = this.sessionToDelete();
    if (!s || this.deleteBlockReason(s)) return;
    this.sessionDeleting.set(true);
    this.sessionDeleteError.set(null);
    try {
      await this.sessionsRepo.delete(s.id);
      this.sessions.update((list) => list.filter((x) => x.id !== s.id));
      this.sessionsChange.emit(this.sessions());
      if (s.speakerAvatarUrl) {
        // Ya borrada en BD: el avatar queda huérfano (mejor esfuerzo).
        const tracker = this.newTracker();
        void tracker.trackDiscarded(s.speakerAvatarUrl);
        await tracker.commit();
      }
      this.sessionToDelete.set(null);
      this.notice.set('Sesión eliminada.');
    } catch (err) {
      // DomainError (p. ej. inscritos agregados entretanto) trae un mensaje legible.
      this.sessionDeleteError.set(
        err instanceof Error ? err.message : 'No se pudo eliminar la sesión.',
      );
    } finally {
      this.sessionDeleting.set(false);
    }
  }

  private openSessionDialog(session: Session | null, value: SessionFormValue): void {
    this.cleanup = this.newTracker();
    this.editingSession.set(session);
    this.sessionModel.set(value);
    this.sessionSubmitted.set(false);
    this.sessionDialogError.set(null);
    this.notice.set(null);
    this.sessionDialogOpen.set(true);
  }

  private newTracker(): AssetCleanupTracker {
    return new AssetCleanupTracker((url) => this.assets.remove(url));
  }
}
