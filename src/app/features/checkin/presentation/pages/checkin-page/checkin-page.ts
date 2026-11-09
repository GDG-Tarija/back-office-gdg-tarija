import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Html5Qrcode } from 'html5-qrcode';

import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';

import { CheckinRepository } from '../../../domain/checkin.repository';
import { CheckinApi } from '../../../../checkin/data/checkin.api';
import { Attendee, Event } from '../../../../events/domain/event.model';
import {
  MatchedCustomResponse,
  filterAttendees,
  getAttendeeRoleSeverity,
  getAttendeeStatusSeverity,
  getMatchedCustomResponses,
  translateAttendeeRole,
  translateAttendeeStatus,
} from '../../../../events/domain/attendee-search';
import { CheckinEntryMode, Session, ScanMode, ScanResult } from '../../../domain/checkin.model';
import { AuthService } from '../../../../../core/auth/services/auth.service';

@Component({
  selector: 'app-checkin-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SelectModule,
    ButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    TagModule,
    DialogModule,
  ],
  providers: [{ provide: CheckinRepository, useClass: CheckinApi }],
  templateUrl: './checkin-page.html',
  styleUrl: './checkin-page.scss',
})
export class CheckinPage implements OnInit, OnDestroy {
  private readonly checkinRepo = inject(CheckinRepository);
  private readonly auth = inject(AuthService);

  private html5Qrcode: Html5Qrcode | null = null;
  private lastScannedCode: string | null = null;
  private lastScannedTime = 0;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedAttendeesEventId: string | null = null;

  // Reactividad con Signals
  readonly events = signal<Event[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly loadingEvents = signal<boolean>(false);
  readonly loadingSessions = signal<boolean>(false);

  readonly selectedEvent = signal<Event | null>(null);
  readonly selectedMode = signal<ScanMode>('checkin');
  readonly selectedSession = signal<Session | null>(null);
  readonly entryMode = signal<CheckinEntryMode>('qr');

  // Búsqueda manual de inscritos
  readonly attendees = signal<Attendee[]>([]);
  readonly loadingAttendees = signal<boolean>(false);
  readonly attendeesError = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly debouncedQuery = signal<string>('');

  readonly filteredAttendees = computed(() =>
    filterAttendees(this.attendees(), this.debouncedQuery()),
  );
  readonly visibleAttendees = computed(() => this.filteredAttendees().slice(0, 50));

  // Cámara e interface de escáner
  readonly cameras = signal<{ id: string; label: string }[]>([]);
  readonly selectedCameraId = signal<string | null>(null);
  readonly scanning = signal<boolean>(false);
  readonly qrError = signal<string | null>(null);
  readonly isProcessing = signal<boolean>(false);

  // Resultados del escaneo / verificación
  readonly scanResult = signal<ScanResult | null>(null);
  readonly pendingConfirmCode = signal<string | null>(null);
  readonly showConfirmDialog = signal<boolean>(false);

  // Modos de escaneo disponibles
  readonly modeOptions = [
    { label: 'Registro de Asistencia (Check-in)', value: 'checkin' },
    { label: 'Entrega de Refrigerio / Snack', value: 'refrigerio' },
    { label: 'Ingreso a Sesión / Taller', value: 'session' },
  ];

  ngOnInit(): void {
    void this.loadEvents();
    void this.loadCameras();
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    void this.stopScanner();
  }

  async loadEvents(): Promise<void> {
    this.loadingEvents.set(true);
    try {
      const data = await this.checkinRepo.getEvents();
      this.events.set(data);
      if (data.length > 0) {
        this.selectedEvent.set(data[0]);
        if (this.entryMode() === 'manual') {
          void this.loadAttendees(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading events for check-in:', err);
    } finally {
      this.loadingEvents.set(false);
    }
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
      this.attendeesError.set('No se pudo cargar la lista de inscritos del evento.');
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
      if (event) {
        void this.loadAttendees(event.id);
      }
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

  async loadCameras(): Promise<void> {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        const list = devices.map((d, index) => ({
          id: d.id,
          label: d.label || `Cámara ${index + 1}`,
        }));
        this.cameras.set(list);

        // Seleccionar cámara trasera por defecto si existe (para dispositivos móviles)
        const backCamera = list.find(
          (c) =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('trasera') ||
            c.label.toLowerCase().includes('environment') ||
            c.label.toLowerCase().includes('rear'),
        );

        this.selectedCameraId.set(backCamera ? backCamera.id : list[0].id);
      } else {
        this.qrError.set('No se encontraron cámaras de video disponibles.');
      }
    } catch (err) {
      console.error('Error accessing cameras:', err);
      this.qrError.set('Permiso de acceso a la cámara denegado o no disponible.');
    }
  }

  async loadSessions(eventId: string): Promise<void> {
    this.loadingSessions.set(true);
    try {
      const data = await this.checkinRepo.getSessions(eventId);
      this.sessions.set(data);
      if (data.length > 0) {
        this.selectedSession.set(data[0]);
      } else {
        this.selectedSession.set(null);
      }
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
    this.scanResult.set(null);
    this.pendingConfirmCode.set(null);
    this.showConfirmDialog.set(false);
    this.lastScannedCode = null;
    this.attendees.set([]);
    this.loadedAttendeesEventId = null;
    this.attendeesError.set(null);

    if (event && this.selectedMode() === 'session') {
      void this.loadSessions(event.id);
    }

    if (event && this.entryMode() === 'manual') {
      void this.loadAttendees(event.id, true);
    }

    // Si estaba escaneando, reiniciamos el escáner para asegurar sincronización
    if (this.scanning()) {
      const camId = this.selectedCameraId();
      if (camId) {
        void this.startScanner(camId);
      }
    }
  }

  onModeChange(): void {
    this.scanResult.set(null);
    this.pendingConfirmCode.set(null);
    this.showConfirmDialog.set(false);
    this.lastScannedCode = null;
    this.qrError.set(null);

    const event = this.selectedEvent();
    if (this.selectedMode() === 'session' && event) {
      void this.loadSessions(event.id);
    }
  }

  onCameraChange(): void {
    if (this.scanning()) {
      const camId = this.selectedCameraId();
      if (camId) {
        void this.startScanner(camId);
      }
    }
  }

  async toggleCamera(): Promise<void> {
    const isScanning = this.scanning();
    if (isScanning) {
      await this.stopScanner();
    } else {
      const camId = this.selectedCameraId();
      if (camId) {
        await this.startScanner(camId);
      } else {
        this.qrError.set('Seleccione una cámara primero.');
      }
    }
  }

  async startScanner(cameraId: string): Promise<void> {
    await this.stopScanner();

    this.qrError.set(null);
    this.scanning.set(true);
    this.html5Qrcode = new Html5Qrcode('reader');

    try {
      await this.html5Qrcode.start(
        cameraId,
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
          // Ignorar errores de escaneo de fotogramas sin código QR
        },
      );

      // Evitar bloqueos de autoplay en navegadores estrictos (macOS/iOS) forzando la reproducción del stream
      const videoEl = document.querySelector('#reader video') as HTMLVideoElement;
      if (videoEl) {
        videoEl.muted = true;
        videoEl.setAttribute('playsinline', 'true');
        if (videoEl.paused) {
          void videoEl
            .play()
            .catch((err) => console.warn('Forzar autoplay de cámara fallido:', err));
        }
      }
    } catch (err) {
      console.error('Error starting Html5Qrcode:', err);
      this.scanning.set(false);
      this.qrError.set('No se pudo iniciar el escaneo de video en esta cámara.');
    }
  }

  async stopScanner(): Promise<void> {
    if (this.html5Qrcode) {
      if (this.html5Qrcode.isScanning) {
        try {
          await this.html5Qrcode.stop();
        } catch (err) {
          console.error('Error stopping Html5Qrcode:', err);
        }
      }
      this.html5Qrcode = null;
    }
    this.scanning.set(false);
  }

  async selectAttendee(attendee: Attendee): Promise<void> {
    if (this.showConfirmDialog() || this.isProcessing()) {
      return;
    }
    this.lastScannedCode = null;
    await this.verifyAndOpenDialog(attendee.id);
  }

  async handleQrDecoded(decodedText: string): Promise<void> {
    const now = Date.now();

    // Evitar llamadas duplicadas consecutivas o mientras haya un diálogo abierto
    if (
      this.showConfirmDialog() ||
      this.isProcessing() ||
      (this.lastScannedCode === decodedText && now - this.lastScannedTime < 3000)
    ) {
      return;
    }

    this.lastScannedCode = decodedText;
    this.lastScannedTime = now;

    await this.verifyAndOpenDialog(decodedText);
  }

  private async verifyAndOpenDialog(registrationId: string): Promise<void> {
    const event = this.selectedEvent();
    if (!event) {
      this.qrError.set('Debe seleccionar un evento antes de registrar asistencia.');
      this.playErrorSound();
      return;
    }

    const mode = this.selectedMode();
    const session = this.selectedSession();

    if (mode === 'session' && !session) {
      this.qrError.set('Debe seleccionar una sesión para registrar el ingreso.');
      this.playErrorSound();
      return;
    }

    this.qrError.set(null);
    this.isProcessing.set(true);

    try {
      // En un flujo de dos pasos, primero verificamos la credencial en la base de datos
      const result = await this.checkinRepo.verifyRegistration(
        registrationId,
        event.id,
        mode,
        mode === 'session' && session ? session.id : null,
      );

      // Enriquecer la etiqueta de tipo de escaneo para incluir el título de la charla
      let scanTypeLabel = result.scanTypeLabel || '';
      if (mode === 'session' && session) {
        scanTypeLabel = `Sesión: ${session.title}`;
      }

      this.scanResult.set({
        ...result,
        scanTypeLabel,
        scannedCode: registrationId,
        scannedAt: result.scannedAt || new Date(),
      });

      // Abrir el diálogo para mostrar la información del participante
      this.showConfirmDialog.set(true);

      if (result.success && !result.alreadyScanned) {
        // Marcamos que hay un check-in listo para confirmación manual
        this.pendingConfirmCode.set(registrationId);
      } else {
        // Si ya fue escaneado o hay un error, limpiamos pendiente y tocamos sonido de aviso/error
        this.pendingConfirmCode.set(null);
        if (result.alreadyScanned) {
          this.playWarningSound();
        } else {
          this.playErrorSound();
        }
      }
    } catch (err) {
      console.error('Error verifying scan:', err);
      this.playErrorSound();
      this.pendingConfirmCode.set(null);
      this.scanResult.set({
        success: false,
        message: 'Ocurrió un error inesperado al verificar la asistencia.',
        scannedCode: registrationId,
      });
      this.showConfirmDialog.set(true);
    } finally {
      this.isProcessing.set(false);
    }
  }

  async confirmCheckin(): Promise<void> {
    const code = this.pendingConfirmCode();
    const event = this.selectedEvent();
    if (!code || !event) return;

    const mode = this.selectedMode();
    const session = this.selectedSession();

    this.isProcessing.set(true);

    try {
      // Registrar el check-in confirmado en el backend
      const result = await this.checkinRepo.registerScan(
        code,
        event.id,
        mode,
        mode === 'session' && session ? session.id : null,
        this.auth.user()?.id || null,
      );

      // Enriquecer la etiqueta
      let scanTypeLabel = result.scanTypeLabel || '';
      if (mode === 'session' && session) {
        scanTypeLabel = `Sesión: ${session.title}`;
      }

      const scannedAt = result.scannedAt || new Date();

      this.scanResult.set({
        ...result,
        scanTypeLabel,
        scannedCode: code,
        scannedAt,
      });

      // Limpiar el código pendiente para pasar de "Confirmación Pendiente" a "Registro Exitoso" (u otro estado)
      this.pendingConfirmCode.set(null);

      // Reproducir sonido final según el resultado de inserción
      if (result.success) {
        this.updateAttendeeAfterScan(code, mode, session?.id ?? null, scannedAt);
        this.playSuccessSound();
        // Si fue exitoso, auto-cerrar el diálogo tras 1.5 segundos para agilizar el flujo de check-in
        setTimeout(() => {
          if (this.showConfirmDialog() && this.scanResult()?.scannedCode === code) {
            this.cancelCheckin();
          }
        }, 1500);
      } else {
        if (result.alreadyScanned) {
          this.playWarningSound();
        } else {
          this.playErrorSound();
        }
      }
    } catch (err) {
      console.error('Error confirming check-in:', err);
      this.playErrorSound();
      this.scanResult.set({
        success: false,
        message: 'Ocurrió un error inesperado al confirmar la asistencia.',
        scannedCode: code,
      });
      this.pendingConfirmCode.set(null);
    } finally {
      this.isProcessing.set(false);
    }
  }

  private updateAttendeeAfterScan(
    registrationId: string,
    mode: ScanMode,
    sessionId: string | null,
    scannedAt: Date,
  ): void {
    const scanType =
      mode === 'checkin'
        ? 'checkin'
        : mode === 'refrigerio'
          ? 'refrigerio'
          : `session_entry:${(sessionId || '').substring(0, 16)}`;

    this.attendees.update((list) =>
      list.map((attendee) => {
        if (attendee.id !== registrationId) return attendee;
        const currentScans = attendee.scanTypes ?? [];
        const updatedScans = currentScans.includes(scanType)
          ? currentScans
          : [...currentScans, scanType];

        return {
          ...attendee,
          checkedIn: mode === 'checkin' ? true : attendee.checkedIn,
          checkedInAt: mode === 'checkin' ? scannedAt : attendee.checkedInAt,
          refrigerioDelivered: mode === 'refrigerio' ? true : attendee.refrigerioDelivered,
          refrigerioDeliveredAt: mode === 'refrigerio' ? scannedAt : attendee.refrigerioDeliveredAt,
          scanTypes: updatedScans,
        };
      }),
    );
  }

  cancelCheckin(): void {
    this.showConfirmDialog.set(false);
    this.pendingConfirmCode.set(null);
    this.scanResult.set(null);
    this.lastScannedCode = null;
  }

  isAttendeeScannedForCurrentMode(attendee: Attendee): boolean {
    const mode = this.selectedMode();
    if (mode === 'checkin') {
      return !!attendee.checkedIn;
    }
    if (mode === 'refrigerio') {
      return !!attendee.refrigerioDelivered;
    }
    const session = this.selectedSession();
    if (mode === 'session' && session) {
      const scanKey = `session_entry:${session.id.substring(0, 16)}`;
      return !!attendee.scanTypes?.includes(scanKey);
    }
    return false;
  }

  getMatchedResponses(attendee: Attendee): MatchedCustomResponse[] {
    return getMatchedCustomResponses(attendee, this.debouncedQuery());
  }

  // Efectos de sonido mediante Web Audio API puro
  private playSuccessSound(): void {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Beep agudo y limpio (nota La5)
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.16);
    } catch (e) {
      console.warn('Web Audio API is not fully supported on this browser context:', e);
    }
  }

  private playWarningSound(): void {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(370, audioCtx.currentTime); // Tono de aviso medio-bajo (Fa#4)
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.32);
    } catch (e) {
      console.warn('Web Audio API warning sound failed:', e);
    }
  }

  private playErrorSound(): void {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, audioCtx.currentTime); // Sonido de zumbido bajo y raspado
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.42);
    } catch (e) {
      console.warn('Web Audio API error sound failed:', e);
    }
  }

  // Traducción y estilo de roles y estados reutilizando el dominio
  getRoleSeverity(role?: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    return getAttendeeRoleSeverity(role);
  }

  translateRole(role?: string): string {
    return translateAttendeeRole(role);
  }

  getStatusSeverity(status?: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    return getAttendeeStatusSeverity(status);
  }

  translateStatus(status?: string): string {
    return translateAttendeeStatus(status);
  }
}
