import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Html5Qrcode } from 'html5-qrcode';

import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';

import { CheckinRepository } from '../../../domain/checkin.repository';
import { CheckinApi } from '../../../../checkin/data/checkin.api';
import { Attendee, Event } from '../../../../events/domain/event.model';
import {
  MatchedCustomResponse,
  filterAttendees,
  getMatchedCustomResponses,
  translateAttendeeRole,
} from '../../../../events/domain/attendee-search';
import { CheckinEntryMode, ScanMode, ScanResult, Session } from '../../../domain/checkin.model';
import {
  CheckinStats,
  DoorState,
  MODE_NAMES,
  counterText,
  manualRowState,
  ManualRowState,
  toDoorState,
} from '../../../domain/door-result';
import { eventsVisibleTo, pickInitialEvent } from '../../../domain/event-preselection';
import { RecentScan, markScanUndone, pushRecentScan } from '../../../domain/scan-history';
import { AuthService } from '../../../../../core/auth/services/auth.service';

const LAST_EVENT_KEY = 'checkin:last-event';
/** Cuánto se queda el verde en pantalla: es la ventana para "Deshacer". */
const SUCCESS_VISIBLE_MS = 5000;
const SUCCESS_NO_UNDO_MS = 2500;

interface DoorView {
  state: DoorState;
  result: ScanResult;
  mode: ScanMode;
  registrationId: string;
  name: string;
}

@Component({
  selector: 'app-checkin-page',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, SelectModule, InputTextModule],
  providers: [{ provide: CheckinRepository, useClass: CheckinApi }],
  templateUrl: './checkin-page.html',
  styleUrl: './checkin-page.scss',
})
export class CheckinPage implements OnInit, OnDestroy {
  private readonly checkinRepo = inject(CheckinRepository);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private html5Qrcode: Html5Qrcode | null = null;
  private lastScannedCode: string | null = null;
  private lastScannedTime = 0;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private doorTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedAttendeesEventId: string | null = null;
  private audioCtx: AudioContext | null = null;

  readonly events = signal<Event[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly loadingEvents = signal<boolean>(false);
  readonly loadingSessions = signal<boolean>(false);
  readonly eventsError = signal<string | null>(null);

  readonly selectedEvent = signal<Event | null>(null);
  readonly selectedMode = signal<ScanMode>('checkin');
  readonly selectedSession = signal<Session | null>(null);
  readonly entryMode = signal<CheckinEntryMode>('qr');

  readonly attendees = signal<Attendee[]>([]);
  readonly loadingAttendees = signal<boolean>(false);
  readonly attendeesError = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly debouncedQuery = signal<string>('');

  readonly filteredAttendees = computed(() =>
    filterAttendees(this.attendees(), this.debouncedQuery()),
  );
  readonly visibleAttendees = computed(() => this.filteredAttendees().slice(0, 50));

  readonly cameraFacing = signal<'environment' | 'user'>('environment');
  readonly scanning = signal<boolean>(false);
  readonly cameraStarting = signal<boolean>(false);
  readonly qrError = signal<string | null>(null);
  readonly isProcessing = signal<boolean>(false);

  readonly door = signal<DoorView | null>(null);
  readonly undoing = signal<boolean>(false);
  readonly undoError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly stats = signal<CheckinStats | null>(null);
  readonly recentScans = signal<RecentScan[]>([]);

  readonly modeOptions: { label: string; value: ScanMode; icon: string }[] = [
    { label: MODE_NAMES.checkin, value: 'checkin', icon: 'how_to_reg' },
    { label: MODE_NAMES.refrigerio, value: 'refrigerio', icon: 'lunch_dining' },
    { label: MODE_NAMES.session, value: 'session', icon: 'co_present' },
  ];

  readonly counter = computed(() => {
    const stats = this.stats();
    return stats ? counterText(this.selectedMode(), stats) : null;
  });

  readonly primaryButton = viewChild<ElementRef<HTMLButtonElement>>('doorPrimary');

  constructor() {
    // El foco pasa al botón del resultado para que Enter/Espacio lo cierren sin buscar el ratón.
    effect(() => this.primaryButton()?.nativeElement.focus());
  }

  ngOnInit(): void {
    void this.loadEvents();
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    if (this.doorTimer) clearTimeout(this.doorTimer);
    void this.stopScanner();
    void this.audioCtx?.close().catch(() => undefined);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.door()) this.dismissDoor();
  }

  async loadEvents(): Promise<void> {
    this.loadingEvents.set(true);
    this.eventsError.set(null);
    try {
      const role = this.auth.role();
      const [all, assigned] = await Promise.all([
        this.checkinRepo.getEvents(),
        role === 'STAFF' ? this.checkinRepo.getAssignedEventIds() : Promise.resolve([]),
      ]);
      const visible = eventsVisibleTo(role, all, assigned);
      this.events.set(visible);

      const initial = pickInitialEvent(visible, {
        requestedId: this.route.snapshot.queryParamMap.get('event'),
        lastUsedId: this.readLastEventId(),
        now: new Date(),
      });
      if (initial) {
        this.selectedEvent.set(initial);
        void this.loadStats(initial.id);
        if (this.entryMode() === 'manual') void this.loadAttendees(initial.id);
      }
    } catch (err) {
      console.error('Error loading events for check-in:', err);
      this.eventsError.set('No se pudieron cargar los eventos. Revisa tu conexión y reintenta.');
    } finally {
      this.loadingEvents.set(false);
    }
  }

  private readLastEventId(): string | null {
    try {
      return localStorage.getItem(LAST_EVENT_KEY);
    } catch {
      return null;
    }
  }

  private rememberEvent(eventId: string): void {
    try {
      localStorage.setItem(LAST_EVENT_KEY, eventId);
    } catch {
      // Sin almacenamiento (modo privado): solo se pierde la preselección de la próxima vez.
    }
  }

  private async loadStats(eventId: string): Promise<void> {
    const stats = await this.checkinRepo.getCheckinStats(eventId);
    if (this.selectedEvent()?.id === eventId) this.stats.set(stats);
  }

  async loadAttendees(eventId: string, force = false): Promise<void> {
    if (!force && this.loadedAttendeesEventId === eventId && !this.attendeesError()) {
      return;
    }

    this.loadingAttendees.set(true);
    this.attendeesError.set(null);

    try {
      const list = await this.checkinRepo.getAttendees(eventId);
      this.attendees.set(list);
      this.loadedAttendeesEventId = eventId;
    } catch (err) {
      console.error('Error loading attendees for manual check-in:', err);
      this.attendeesError.set('No se pudo cargar la lista de personas inscritas. Reintenta.');
    } finally {
      this.loadingAttendees.set(false);
    }
  }

  async setEntryMode(mode: CheckinEntryMode): Promise<void> {
    if (this.entryMode() === mode) return;
    this.entryMode.set(mode);
    this.qrError.set(null);

    if (mode === 'manual') {
      await this.stopScanner();
      const event = this.selectedEvent();
      if (event) void this.loadAttendees(event.id);
    }
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    if (!value.trim()) {
      this.debouncedQuery.set('');
      return;
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.debouncedQuery.set(value);
    }, 220);
  }

  clearSearch(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.searchQuery.set('');
    this.debouncedQuery.set('');
  }

  async loadSessions(eventId: string): Promise<void> {
    this.loadingSessions.set(true);
    try {
      const data = await this.checkinRepo.getSessions(eventId);
      this.sessions.set(data);
      this.selectedSession.set(data[0] ?? null);
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      this.loadingSessions.set(false);
    }
  }

  onEventChange(): void {
    const event = this.selectedEvent();
    this.sessions.set([]);
    this.selectedSession.set(null);
    this.dismissDoor();
    this.lastScannedCode = null;
    this.attendees.set([]);
    this.loadedAttendeesEventId = null;
    this.attendeesError.set(null);
    this.recentScans.set([]);
    this.stats.set(null);

    if (!event) return;
    this.rememberEvent(event.id);
    void this.loadStats(event.id);
    if (this.selectedMode() === 'session') void this.loadSessions(event.id);
    if (this.entryMode() === 'manual') void this.loadAttendees(event.id, true);
  }

  setMode(mode: ScanMode): void {
    if (this.selectedMode() === mode) return;
    this.selectedMode.set(mode);
    this.dismissDoor();
    this.lastScannedCode = null;
    this.qrError.set(null);

    const event = this.selectedEvent();
    if (mode === 'session' && event) void this.loadSessions(event.id);
  }

  async startCamera(): Promise<void> {
    await this.stopScanner();

    this.qrError.set(null);
    this.cameraStarting.set(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraStarting.set(false);
      this.qrError.set('Este navegador no permite usar la cámara. Usa la pestaña Manual.');
      return;
    }

    this.html5Qrcode = new Html5Qrcode('reader');
    try {
      await this.html5Qrcode.start(
        { facingMode: this.cameraFacing() },
        {
          fps: 10,
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          void this.handleQrDecoded(decodedText);
        },
        () => {
          // Fotogramas sin código QR: se ignoran.
        },
      );
      this.scanning.set(true);

      // Safari/iOS bloquea el autoplay si el video no está silenciado e inline.
      const videoEl = document.querySelector<HTMLVideoElement>('#reader video');
      if (videoEl) {
        videoEl.muted = true;
        videoEl.setAttribute('playsinline', 'true');
        if (videoEl.paused) {
          void videoEl.play().catch((err) => console.warn('Autoplay de cámara bloqueado:', err));
        }
      }
    } catch (err) {
      console.error('Error starting Html5Qrcode:', err);
      this.html5Qrcode = null;
      this.scanning.set(false);
      this.qrError.set(
        'No pudimos usar la cámara. Permite el acceso en tu navegador o usa la pestaña Manual.',
      );
    } finally {
      this.cameraStarting.set(false);
    }
  }

  async flipCamera(): Promise<void> {
    this.cameraFacing.update((f) => (f === 'environment' ? 'user' : 'environment'));
    if (this.scanning()) await this.startCamera();
  }

  async stopScanner(): Promise<void> {
    const scanner = this.html5Qrcode;
    this.html5Qrcode = null;
    if (scanner?.isScanning) {
      try {
        await scanner.stop();
      } catch (err) {
        console.error('Error stopping Html5Qrcode:', err);
      }
    }
    this.scanning.set(false);
  }

  async selectAttendee(attendee: Attendee): Promise<void> {
    if (this.door() || this.isProcessing()) return;
    this.lastScannedCode = null;
    await this.register(attendee.id);
  }

  async handleQrDecoded(decodedText: string): Promise<void> {
    const now = Date.now();

    // Mientras hay un resultado en pantalla o se está procesando otro, el QR se ignora.
    if (
      this.door() ||
      this.isProcessing() ||
      (this.lastScannedCode === decodedText && now - this.lastScannedTime < 3000)
    ) {
      return;
    }

    this.lastScannedCode = decodedText;
    this.lastScannedTime = now;

    await this.register(decodedText);
  }

  /** Verifica y registra de una vez: el resultado se muestra como semáforo a pantalla completa. */
  private async register(registrationId: string): Promise<void> {
    const event = this.selectedEvent();
    if (!event) {
      this.qrError.set('Elige un evento antes de registrar.');
      return;
    }

    const mode = this.selectedMode();
    const session = this.selectedSession();

    this.qrError.set(null);
    this.notice.set(null);
    this.isProcessing.set(true);

    let result: ScanResult;
    try {
      result = await this.checkinRepo.registerScan(
        registrationId,
        event.id,
        mode,
        mode === 'session' && session ? session.id : null,
        this.auth.user()?.id || null,
      );
    } catch (err) {
      console.error('Error registering scan:', err);
      result = {
        success: false,
        reason: 'error',
        message: 'Ocurrió un error inesperado al registrar.',
      };
    } finally {
      this.isProcessing.set(false);
    }

    const state = toDoorState(result, mode);
    const name = result.attendee
      ? `${result.attendee.firstName} ${result.attendee.lastName}`.trim()
      : 'Código no reconocido';
    const scannedAt = result.scannedAt ?? new Date();

    if (result.success) {
      this.updateAttendeeAfterScan(registrationId, mode, session?.id ?? null, scannedAt);
      this.stats.update((s) => (s ? this.bumpStats(s, mode, 1) : s));
      this.rememberEvent(event.id);
    }
    if (result.alreadyScanned) {
      this.updateAttendeeAfterScan(registrationId, mode, session?.id ?? null, scannedAt);
    }

    this.recentScans.update((list) =>
      pushRecentScan(list, {
        id: result.scanLogId ?? `${registrationId}:${scannedAt.getTime()}`,
        name,
        tone: state.tone,
        label: result.success ? MODE_NAMES[mode] : state.headline,
        at: scannedAt,
      }),
    );

    this.undoError.set(null);
    this.door.set({ state, result, mode, registrationId, name });
    this.signalToOperator(state);

    if (state.tone === 'go') {
      this.doorTimer = setTimeout(
        () => this.dismissDoor(),
        state.undoable ? SUCCESS_VISIBLE_MS : SUCCESS_NO_UNDO_MS,
      );
    }
  }

  private bumpStats(stats: CheckinStats, mode: ScanMode, delta: number): CheckinStats {
    if (mode === 'refrigerio') {
      return { ...stats, refrigerioCount: Math.max(0, stats.refrigerioCount + delta) };
    }
    if (mode === 'checkin') {
      return { ...stats, checkedInCount: Math.max(0, stats.checkedInCount + delta) };
    }
    return stats;
  }

  async undo(): Promise<void> {
    const door = this.door();
    const scanLogId = door?.result.scanLogId;
    if (!door || !scanLogId || this.undoing()) return;

    if (this.doorTimer) {
      clearTimeout(this.doorTimer);
      this.doorTimer = null;
    }
    this.undoing.set(true);
    this.undoError.set(null);

    const session = this.selectedSession();
    const undone = await this.checkinRepo.undoScan({
      scanLogId,
      mode: door.mode,
      sessionId: door.mode === 'session' && session ? session.id : null,
      userId: door.result.userId ?? null,
    });
    this.undoing.set(false);

    if (!undone.ok) {
      this.undoError.set(undone.message);
      return;
    }

    this.revertAttendee(door.registrationId, door.mode, session?.id ?? null);
    this.stats.update((s) => (s ? this.bumpStats(s, door.mode, -1) : s));
    this.recentScans.update((list) => markScanUndone(list, scanLogId));
    this.dismissDoor();
    this.notice.set(`Se deshizo el registro de ${door.name}.`);
  }

  dismissDoor(): void {
    if (this.doorTimer) {
      clearTimeout(this.doorTimer);
      this.doorTimer = null;
    }
    this.door.set(null);
    this.undoError.set(null);
    this.lastScannedCode = null;
    this.lastScannedTime = Date.now();
  }

  private scanTypeFor(mode: ScanMode, sessionId: string | null): string {
    return mode === 'session' ? `session_entry:${(sessionId || '').substring(0, 16)}` : mode;
  }

  private updateAttendeeAfterScan(
    registrationId: string,
    mode: ScanMode,
    sessionId: string | null,
    scannedAt: Date,
  ): void {
    const scanType = this.scanTypeFor(mode, sessionId);

    this.attendees.update((list) =>
      list.map((attendee) => {
        if (attendee.id !== registrationId) return attendee;
        const currentScans = attendee.scanTypes ?? [];
        return {
          ...attendee,
          checkedIn: mode === 'checkin' ? true : attendee.checkedIn,
          checkedInAt: mode === 'checkin' ? scannedAt : attendee.checkedInAt,
          refrigerioDelivered: mode === 'refrigerio' ? true : attendee.refrigerioDelivered,
          refrigerioDeliveredAt: mode === 'refrigerio' ? scannedAt : attendee.refrigerioDeliveredAt,
          scanTypes: currentScans.includes(scanType) ? currentScans : [...currentScans, scanType],
        };
      }),
    );
  }

  private revertAttendee(registrationId: string, mode: ScanMode, sessionId: string | null): void {
    const scanType = this.scanTypeFor(mode, sessionId);

    this.attendees.update((list) =>
      list.map((attendee) =>
        attendee.id !== registrationId
          ? attendee
          : {
              ...attendee,
              checkedIn: mode === 'checkin' ? false : attendee.checkedIn,
              checkedInAt: mode === 'checkin' ? null : attendee.checkedInAt,
              refrigerioDelivered: mode === 'refrigerio' ? false : attendee.refrigerioDelivered,
              refrigerioDeliveredAt: mode === 'refrigerio' ? null : attendee.refrigerioDeliveredAt,
              scanTypes: (attendee.scanTypes ?? []).filter((t) => t !== scanType),
            },
      ),
    );
  }

  isAttendeeScannedForCurrentMode(attendee: Attendee): boolean {
    const mode = this.selectedMode();
    if (mode === 'checkin') return !!attendee.checkedIn;
    if (mode === 'refrigerio') return !!attendee.refrigerioDelivered;
    const session = this.selectedSession();
    if (session) {
      return !!attendee.scanTypes?.includes(this.scanTypeFor('session', session.id));
    }
    return false;
  }

  rowState(attendee: Attendee): ManualRowState {
    return manualRowState(
      attendee.status,
      this.isAttendeeScannedForCurrentMode(attendee),
      this.selectedMode(),
    );
  }

  getMatchedResponses(attendee: Attendee): MatchedCustomResponse[] {
    return getMatchedCustomResponses(attendee, this.debouncedQuery());
  }

  translateRole(role?: string): string {
    return translateAttendeeRole(role);
  }

  /** Vibración y sonido: la puerta suele ser ruidosa, así que el color no es lo único que avisa. */
  private signalToOperator(state: DoorState): void {
    const pattern = state.tone === 'go' ? [120] : state.tone === 'wait' ? [80, 60, 80] : [250];
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Sin vibración en este dispositivo.
    }

    if (state.tone === 'go') this.beep(880, 'sine', 0.08, 0.16);
    else if (state.tone === 'wait') this.beep(370, 'triangle', 0.12, 0.3);
    else this.beep(120, 'sawtooth', 0.15, 0.4);
  }

  private beep(frequency: number, type: OscillatorType, volume: number, seconds: number): void {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx ??= new AudioContextClass();
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);

      osc.start();
      osc.stop(ctx.currentTime + seconds + 0.02);
    } catch (e) {
      console.warn('Web Audio no disponible:', e);
    }
  }
}
