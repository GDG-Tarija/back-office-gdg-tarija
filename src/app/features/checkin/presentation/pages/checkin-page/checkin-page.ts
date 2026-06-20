import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Html5Qrcode } from 'html5-qrcode';

import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { CheckinRepository } from '../../../domain/checkin.repository';
import { CheckinApi } from '../../../../checkin/data/checkin.api';
import { Event } from '../../../../events/domain/event.model';
import { Session, ScanMode, ScanResult } from '../../../domain/checkin.model';
import { AuthService } from '../../../../../core/auth/services/auth.service';

@Component({
  selector: 'app-checkin-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SelectModule,
    ButtonModule,
    ProgressSpinnerModule,
    TagModule,
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

  // Reactividad con Signals
  readonly events = signal<Event[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly loadingEvents = signal<boolean>(false);
  readonly loadingSessions = signal<boolean>(false);

  readonly selectedEvent = signal<Event | null>(null);
  readonly selectedMode = signal<ScanMode>('checkin');
  readonly selectedSession = signal<Session | null>(null);

  // Cámara e interface de escáner
  readonly cameras = signal<{ id: string; label: string }[]>([]);
  readonly selectedCameraId = signal<string | null>(null);
  readonly scanning = signal<boolean>(false);
  readonly qrError = signal<string | null>(null);
  readonly isProcessing = signal<boolean>(false);

  // Resultados del escaneo
  readonly scanResult = signal<ScanResult | null>(null);
  readonly pendingConfirmCode = signal<string | null>(null);

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
    void this.stopScanner();
  }

  async loadEvents(): Promise<void> {
    this.loadingEvents.set(true);
    try {
      const data = await this.checkinRepo.getEvents();
      this.events.set(data);
      if (data.length > 0) {
        this.selectedEvent.set(data[0]);
      }
    } catch (err) {
      console.error('Error loading events for check-in:', err);
    } finally {
      this.loadingEvents.set(false);
    }
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
    this.lastScannedCode = null;

    if (event && this.selectedMode() === 'session') {
      void this.loadSessions(event.id);
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
    this.lastScannedCode = null;

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

  async handleQrDecoded(decodedText: string): Promise<void> {
    const now = Date.now();

    // Evitar llamadas duplicadas consecutivas dentro de 3 segundos para el mismo código
    if (this.lastScannedCode === decodedText && now - this.lastScannedTime < 3000) {
      return;
    }

    this.lastScannedCode = decodedText;
    this.lastScannedTime = now;

    const event = this.selectedEvent();
    if (!event) {
      this.qrError.set('Debe seleccionar un evento antes de escanear.');
      this.playErrorSound();
      return;
    }

    const mode = this.selectedMode();
    const session = this.selectedSession();

    if (mode === 'session' && !session) {
      this.qrError.set('Debe seleccionar una sesión para el escaneo de sesión.');
      this.playErrorSound();
      return;
    }

    this.isProcessing.set(true);

    try {
      // En un flujo de dos pasos, primero verificamos la credencial en la base de datos
      const result = await this.checkinRepo.verifyRegistration(
        decodedText,
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
        scannedCode: decodedText,
        scannedAt: result.scannedAt || new Date(),
      });

      if (result.success && !result.alreadyScanned) {
        // Marcamos que hay un check-in listo para confirmación manual
        this.pendingConfirmCode.set(decodedText);
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
        scannedCode: decodedText,
      });
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

      this.scanResult.set({
        ...result,
        scanTypeLabel,
        scannedCode: code,
        scannedAt: result.scannedAt || new Date(),
      });

      this.pendingConfirmCode.set(null);

      // Reproducir sonido final según el resultado de inserción
      if (result.success) {
        this.playSuccessSound();
      } else if (result.alreadyScanned) {
        this.playWarningSound();
      } else {
        this.playErrorSound();
      }
    } catch (err) {
      console.error('Error confirming check-in:', err);
      this.playErrorSound();
      this.scanResult.set({
        success: false,
        message: 'Ocurrió un error inesperado al confirmar la asistencia.',
        scannedCode: code,
      });
    } finally {
      this.isProcessing.set(false);
    }
  }

  cancelCheckin(): void {
    this.pendingConfirmCode.set(null);
    this.scanResult.set(null);
    this.lastScannedCode = null;
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

  // Traducción y estilo de roles
  getRoleSeverity(role?: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (role?.toUpperCase()) {
      case 'ORGANIZER':
      case 'STAFF':
        return 'danger';
      case 'SPEAKER':
        return 'warn';
      case 'VOLUNTEER':
        return 'info';
      default:
        return 'secondary';
    }
  }

  translateRole(role?: string): string {
    switch (role?.toUpperCase()) {
      case 'ORGANIZER':
      case 'STAFF':
        return 'Staff';
      case 'SPEAKER':
        return 'Expositor';
      case 'VOLUNTEER':
        return 'Voluntario';
      case 'ATTENDEE':
        return 'Asistente';
      default:
        return role || 'Asistente';
    }
  }
}
