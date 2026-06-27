import { Component, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { FileUploadModule } from 'primeng/fileupload';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ProgressBarModule } from 'primeng/progressbar';
import { InputNumberModule } from 'primeng/inputnumber';

import { EventsRepository } from '../../../domain/events.repository';
import { EventsApi } from '../../../data/events.api';
import { Event as DomainEvent, Attendee, CredentialPosition } from '../../../domain/event.model';

import QRCode from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const STORAGE_KEY = 'gdg-credential-positions';

const DEFAULT_POSITIONS: CredentialPosition = {
  nameX: 50,
  nameY: 280,
  roleX: 50,
  roleY: 320,
  qrX: 350,
  qrY: 250,
  qrSize: 120,
  fontSize: 24,
  showRole: true,
  nameMaxWidth: 400,
};

const ROLE_OPTIONS = [
  { label: 'Participante', value: 'ATTENDEE' },
  { label: 'Speaker', value: 'SPEAKER' },
  { label: 'Staff', value: 'STAFF' },
  { label: 'Voluntario', value: 'VOLUNTEER' },
];

const MAX_PREVIEW_HEIGHT = 480;

@Component({
  selector: 'app-credential-generator',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    SelectModule,
    FileUploadModule,
    ProgressSpinnerModule,
    ProgressBarModule,
    InputNumberModule,
  ],
  providers: [{ provide: EventsRepository, useClass: EventsApi }],
  templateUrl: './credential-generator.html',
  styleUrl: './credential-generator.scss',
})
export class CredentialGenerator implements OnInit, OnDestroy {
  private readonly eventsRepo = inject(EventsRepository);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  readonly ROLE_OPTIONS = ROLE_OPTIONS;

  readonly visible = signal(false);
  readonly events = signal<DomainEvent[]>([]);
  readonly loadingEvents = signal(false);
  readonly selectedEvent = signal<DomainEvent | null>(null);
  readonly selectedRole = signal<string | null>(null);
  readonly templateFile = signal<File | null>(null);
  readonly templateDataUrl = signal<string | null>(null);
  readonly templateImage = signal<HTMLImageElement | null>(null);
  readonly positions = signal<CredentialPosition>({ ...DEFAULT_POSITIONS });
  readonly filteredAttendees = signal<Attendee[]>([]);
  readonly loadingAttendees = signal(false);
  readonly generating = signal(false);
  readonly generationProgress = signal(0);
  readonly previewWidth = signal(0);
  readonly previewHeight = signal(0);

  // Propiedades de exportación PDF
  readonly pdfPageSize = signal<'A4' | 'LETTER' | 'OFICIO'>('A4');
  readonly pdfSpacing = signal<number>(0.2); // en cm
  readonly pdfMargin = signal<number>(1.0); // en cm
  readonly pdfCredentialWidth = signal<number>(6.0); // en cm
  readonly pdfCredentialHeight = signal<number>(9.0); // en cm
  readonly pdfLayoutMode = signal<
    'auto' | 'portrait_normal' | 'landscape_normal' | 'portrait_rotated' | 'landscape_rotated'
  >('auto');
  readonly pdfImageQuality = signal<'high' | 'medium' | 'low'>('medium');

  private templateImg: HTMLImageElement | null = null;
  private hasStoredPositions = false;

  ngOnInit(): void {
    this.loadPositions();
  }

  private adjustDefaultPositions(width: number, height: number): void {
    if (this.hasStoredPositions) return;

    const qrSize = Math.max(Math.round(width * 0.2), 80);
    const fontSize = Math.max(Math.round(width * 0.04), 16);

    const nameX = Math.round(width / 2);
    const roleX = Math.round(width / 2);
    const qrX = Math.round((width - qrSize) / 2);

    const nameY = Math.round(height * 0.45);
    const roleY = Math.round(height * 0.53);
    const qrY = Math.round(height * 0.65);

    this.positions.set({
      nameX,
      nameY,
      roleX,
      roleY,
      qrX,
      qrY,
      qrSize,
      fontSize,
      showRole: true,
      nameMaxWidth: Math.round(width * 0.8),
    });
    this.savePositions();
  }

  ngOnDestroy(): void {
    this.savePositions();
  }

  async open(event?: DomainEvent): Promise<void> {
    this.visible.set(true);
    await this.loadEvents();
    if (event) {
      this.selectedEvent.set(event);
      await this.loadAttendees();
    }
  }

  close(): void {
    this.visible.set(false);
    this.resetForm();
  }

  private resetForm(): void {
    this.selectedEvent.set(null);
    this.selectedRole.set(null);
    this.templateFile.set(null);
    this.templateDataUrl.set(null);
    this.templateImage.set(null);
    this.filteredAttendees.set([]);
    this.generationProgress.set(0);
    this.templateImg = null;
    this.previewWidth.set(0);
    this.previewHeight.set(0);
  }

  async loadEvents(): Promise<void> {
    this.loadingEvents.set(true);
    try {
      const data = await this.eventsRepo.getEvents();
      this.events.set(data);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      this.loadingEvents.set(false);
    }
  }

  async onEventChange(): Promise<void> {
    await this.loadAttendees();
    this.renderPreview();
  }

  async loadAttendees(): Promise<void> {
    const event = this.selectedEvent();
    if (!event) return;

    this.loadingAttendees.set(true);
    try {
      const attendees = await this.eventsRepo.getAttendees(event.id);
      this.filteredAttendees.set(attendees);
    } catch (err) {
      console.error('Error loading attendees:', err);
      this.filteredAttendees.set([]);
    } finally {
      this.loadingAttendees.set(false);
    }
  }

  onRoleChange(): void {
    this.renderPreview();
  }

  onTemplateUpload(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    this.templateFile.set(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      this.templateDataUrl.set(dataUrl);

      const img = new Image();
      img.onload = () => {
        this.templateImg = img;

        const scale = Math.min(1, MAX_PREVIEW_HEIGHT / img.height);
        this.previewWidth.set(img.width * scale);
        this.previewHeight.set(img.height * scale);

        this.templateImage.set(img);
        this.adjustDefaultPositions(img.width, img.height);

        // Calcular el alto de la credencial en base a la proporción original
        const ratio = img.height / img.width;
        this.pdfCredentialHeight.set(parseFloat((this.pdfCredentialWidth() * ratio).toFixed(2)));

        setTimeout(() => {
          this.renderPreview();
        }, 50);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  getFilteredAttendees(): Attendee[] {
    const role = this.selectedRole();
    if (!role) return this.filteredAttendees();
    if (role === 'STAFF') {
      return this.filteredAttendees().filter(
        (a) => a.role?.toUpperCase() === 'STAFF' || a.role?.toUpperCase() === 'ORGANIZER',
      );
    }
    return this.filteredAttendees().filter((a) => a.role === role);
  }

  translateRole(role: string): string {
    const map: Record<string, string> = {
      ATTENDEE: 'Participante',
      SPEAKER: 'Speaker',
      ORGANIZER: 'Staff',
      STAFF: 'Staff',
      VOLUNTEER: 'Voluntario',
    };
    return map[role?.toUpperCase()] || role;
  }

  drawNameText(
    ctx: CanvasRenderingContext2D,
    fullName: string,
    x: number,
    y: number,
    fontSize: number,
    maxWidth?: number,
  ): void {
    const words = fullName
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    if (maxWidth && maxWidth > 0) {
      while (words.length > 1) {
        const textLine = words.join(' ');
        const currentWidth = ctx.measureText(textLine).width;
        if (currentWidth <= maxWidth) {
          break;
        }
        words.pop();
      }
    }

    const finalName = words.join(' ');
    ctx.fillText(finalName, x, y);
  }

  async renderPreview(): Promise<void> {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.templateImg) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = this.templateImg;
    canvas.width = img.width;
    canvas.height = img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const pos = this.positions();
    const previewAttendee = this.getFilteredAttendees()[0];

    if (previewAttendee) {
      const fullName = `${previewAttendee.firstName} ${previewAttendee.lastName}`;
      this.drawNameText(ctx, fullName, pos.nameX, pos.nameY, pos.fontSize, pos.nameMaxWidth);

      if (pos.nameMaxWidth && pos.nameMaxWidth > 0) {
        ctx.save();
        const startX = pos.nameX - pos.nameMaxWidth / 2;
        const endX = pos.nameX + pos.nameMaxWidth / 2;
        const boxHeight = Math.max(pos.fontSize * 1.4, 28);
        const boxY = pos.nameY - 4;

        // Fondo semi-transparente para resaltar la zona límite de texto
        ctx.fillStyle = 'rgba(66, 133, 244, 0.12)';
        ctx.fillRect(startX, boxY, pos.nameMaxWidth, boxHeight);

        // Borde discontinuo llamativo (Google Blue vibrante)
        ctx.strokeStyle = '#4285f4';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(startX, boxY, pos.nameMaxWidth, boxHeight);

        // Marcas de límite izquierda y derecha en rojo fuerte
        ctx.setLineDash([]);
        ctx.fillStyle = '#ea4335';
        ctx.fillRect(startX - 2, boxY - 2, 4, boxHeight + 4);
        ctx.fillRect(endX - 2, boxY - 2, 4, boxHeight + 4);

        // Badge flotante tipo pill con el texto "Ancho máx: XXXpx"
        const badgeText = `Ancho máx: ${pos.nameMaxWidth}px`;
        ctx.font = 'bold 12px sans-serif';
        const badgeWidth = ctx.measureText(badgeText).width + 16;
        const badgeX = pos.nameX - badgeWidth / 2;
        const badgeY = boxY - 24;

        ctx.fillStyle = '#4285f4';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(badgeX, badgeY, badgeWidth, 20, 10);
        } else {
          ctx.rect(badgeX, badgeY, badgeWidth, 20);
        }
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, pos.nameX, badgeY + 10);

        ctx.restore();
      }

      if (pos.showRole !== false) {
        ctx.font = `${Math.round(pos.fontSize * 0.75)}px sans-serif`;
        ctx.fillStyle = '#333333';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.fillText(this.translateRole(previewAttendee.role), pos.roleX, pos.roleY);
      }

      try {
        const qrDataUrl = await QRCode.toDataURL(previewAttendee.id, {
          width: pos.qrSize,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        const qrImg = new Image();
        await new Promise<void>((resolve) => {
          qrImg.onload = () => {
            ctx.drawImage(qrImg, pos.qrX, pos.qrY, pos.qrSize, pos.qrSize);
            resolve();
          };
          qrImg.src = qrDataUrl;
        });
      } catch {
        console.warn('Failed to generate QR for preview');
      }
    }
  }

  onPositionChange(): void {
    this.positions.update((p) => ({ ...p }));
    this.renderPreview();
    this.savePositions();
  }

  centerHorizontal(target: 'name' | 'role' | 'qr'): void {
    if (!this.templateImg) return;
    const width = this.templateImg.width;
    const pos = this.positions();

    if (target === 'name') {
      pos.nameX = Math.round(width / 2);
    } else if (target === 'role') {
      pos.roleX = Math.round(width / 2);
    } else if (target === 'qr') {
      pos.qrX = Math.round((width - pos.qrSize) / 2);
    }

    this.positions.update((p) => ({ ...p }));
    this.renderPreview();
    this.savePositions();
  }

  centerVertical(target: 'name' | 'role' | 'qr'): void {
    if (!this.templateImg) return;
    const height = this.templateImg.height;
    const pos = this.positions();

    if (target === 'name') {
      pos.nameY = Math.round(height / 2);
    } else if (target === 'role') {
      pos.roleY = Math.round(height / 2);
    } else if (target === 'qr') {
      pos.qrY = Math.round((height - pos.qrSize) / 2);
    }

    this.positions.update((p) => ({ ...p }));
    this.renderPreview();
    this.savePositions();
  }

  updatePreview(): void {
    this.renderPreview();
    this.savePositions();
  }

  private loadPositions(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CredentialPosition;
        this.positions.set({ ...DEFAULT_POSITIONS, ...parsed });
        this.hasStoredPositions = true;
      } else {
        this.positions.set({ ...DEFAULT_POSITIONS });
        this.hasStoredPositions = false;
      }
    } catch {
      this.positions.set({ ...DEFAULT_POSITIONS });
      this.hasStoredPositions = false;
    }
  }

  private savePositions(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.positions()));
      this.hasStoredPositions = true;
    } catch {
      console.warn('Failed to save positions to localStorage');
    }
  }

  canGenerate(): boolean {
    return !!(this.selectedEvent() && this.templateImg && this.getFilteredAttendees().length > 0);
  }

  async generateCredentials(): Promise<void> {
    const event = this.selectedEvent();
    const attendees = this.getFilteredAttendees();
    const img = this.templateImg;

    if (!event || !img || attendees.length === 0) return;

    this.generating.set(true);
    this.generationProgress.set(0);

    const zip = new JSZip();
    const pos = this.positions();

    for (let i = 0; i < attendees.length; i++) {
      const attendee = attendees[i];
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(img, 0, 0);

      const fullName = `${attendee.firstName} ${attendee.lastName}`;
      this.drawNameText(ctx, fullName, pos.nameX, pos.nameY, pos.fontSize, pos.nameMaxWidth);

      if (pos.showRole !== false) {
        ctx.font = `${Math.round(pos.fontSize * 0.75)}px sans-serif`;
        ctx.fillStyle = '#333333';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.fillText(this.translateRole(attendee.role), pos.roleX, pos.roleY);
      }

      try {
        const qrDataUrl = await QRCode.toDataURL(attendee.id, {
          width: pos.qrSize,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        const qrImg = new Image();
        await new Promise<void>((resolve) => {
          qrImg.onload = () => {
            ctx.drawImage(qrImg, pos.qrX, pos.qrY, pos.qrSize, pos.qrSize);
            resolve();
          };
          qrImg.src = qrDataUrl;
        });
      } catch {
        console.warn(`Failed to generate QR for ${attendee.id}`);
      }

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      const fileName = `${attendee.firstName}_${attendee.lastName}_${attendee.id.slice(0, 8)}.png`;
      zip.file(fileName, blob);

      this.generationProgress.set(Math.round(((i + 1) / attendees.length) * 100));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `credenciales-${event.slug}.zip`);

    this.generating.set(false);
    this.generationProgress.set(0);
  }

  // Ajustar el alto proporcional de forma dinámica al cambiar el ancho
  onPdfWidthChange(width: number): void {
    this.pdfCredentialWidth.set(width);
    if (this.templateImg) {
      const ratio = this.templateImg.height / this.templateImg.width;
      this.pdfCredentialHeight.set(parseFloat((width * ratio).toFixed(2)));
    }
  }

  // Calcular la cuadrícula óptima para aprovechar mejor el papel
  calculatePdfLayout(): {
    pageOrientation: 'portrait' | 'landscape';
    rotateCards: boolean;
    cols: number;
    rows: number;
    capacity: number;
    totalPages: number;
  } {
    const format = this.pdfPageSize();
    const margin = this.pdfMargin();
    const spacing = this.pdfSpacing();
    const w = this.pdfCredentialWidth();
    const h = this.pdfCredentialHeight();
    const totalAttendees = this.getFilteredAttendees().length;

    // Dimensiones de página en centímetros
    let pw = 21.0;
    let ph = 29.7;
    if (format === 'LETTER') {
      pw = 21.59;
      ph = 27.94;
    } else if (format === 'OFICIO') {
      pw = 21.6;
      ph = 33.0;
    }

    const mode = this.pdfLayoutMode();

    // Helper para calcular la grilla dada una dimensión de página y tarjeta
    const getGrid = (pageW: number, pageH: number, cardW: number, cardH: number) => {
      const availW = pageW - 2 * margin;
      const availH = pageH - 2 * margin;
      const cols = Math.max(1, Math.floor((availW + spacing) / (cardW + spacing)));
      const rows = Math.max(1, Math.floor((availH + spacing) / (cardH + spacing)));
      return { cols, rows, capacity: cols * rows };
    };

    // Estructuras de las 4 combinaciones
    const layouts = [
      {
        key: 'portrait_normal' as const,
        pageOrientation: 'portrait' as const,
        rotateCards: false,
        ...getGrid(pw, ph, w, h),
        preference: 4, // Sin rotación en vertical preferido
      },
      {
        key: 'landscape_normal' as const,
        pageOrientation: 'landscape' as const,
        rotateCards: false,
        ...getGrid(ph, pw, w, h),
        preference: 3,
      },
      {
        key: 'portrait_rotated' as const,
        pageOrientation: 'portrait' as const,
        rotateCards: true,
        ...getGrid(pw, ph, h, w),
        preference: 2,
      },
      {
        key: 'landscape_rotated' as const,
        pageOrientation: 'landscape' as const,
        rotateCards: true,
        ...getGrid(ph, pw, h, w),
        preference: 1,
      },
    ];

    let selectedLayout;
    if (mode === 'auto') {
      // Ordenar por capacidad máxima descendente y luego por preferencia estética
      const sorted = [...layouts].sort((a, b) => {
        if (b.capacity !== a.capacity) {
          return b.capacity - a.capacity;
        }
        return b.preference - a.preference;
      });
      selectedLayout = sorted[0];
    } else {
      selectedLayout = layouts.find((l) => l.key === mode) || layouts[0];
    }

    const capacity = selectedLayout.capacity;
    const totalPages = capacity > 0 ? Math.ceil(totalAttendees / capacity) : 0;

    return {
      pageOrientation: selectedLayout.pageOrientation,
      rotateCards: selectedLayout.rotateCards,
      cols: selectedLayout.cols,
      rows: selectedLayout.rows,
      capacity,
      totalPages,
    };
  }

  // Rotar el canvas 90 grados físicamente para mantener la calidad y consistencia
  rotateCanvas90(original: HTMLCanvasElement): HTMLCanvasElement {
    const rotated = document.createElement('canvas');
    rotated.width = original.height;
    rotated.height = original.width;
    const ctx = rotated.getContext('2d');
    if (ctx) {
      // Si la calidad seleccionada no es 'alta', rellenamos el fondo con blanco
      // para evitar que la transparencia del canvas se convierta en negro en JPEG.
      const qualityMode = this.pdfImageQuality();
      if (qualityMode !== 'high') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rotated.width, rotated.height);
      }
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(original, -original.width / 2, -original.height / 2);
    }
    return rotated;
  }

  // Generar y descargar el PDF con la grilla optimizada
  async generatePdf(): Promise<void> {
    const event = this.selectedEvent();
    const attendees = this.getFilteredAttendees();
    const img = this.templateImg;

    if (!event || !img || attendees.length === 0) return;

    this.generating.set(true);
    this.generationProgress.set(0);

    try {
      const { jsPDF } = await import('jspdf');

      const format = this.pdfPageSize();
      const margin = this.pdfMargin();
      const spacing = this.pdfSpacing();
      const cardW = this.pdfCredentialWidth();
      const cardH = this.pdfCredentialHeight();

      const layout = this.calculatePdfLayout();

      // Formato y dimensiones para jsPDF
      let pdfFormat: string | [number, number] = 'a4';
      if (format === 'LETTER') {
        pdfFormat = 'letter';
      } else if (format === 'OFICIO') {
        pdfFormat = [21.6, 33.0];
      }

      const doc = new jsPDF({
        orientation: layout.pageOrientation,
        unit: 'cm',
        format: pdfFormat,
      });

      const pos = this.positions();
      const itemsPerPage = layout.capacity;

      // Determinar parámetros de calidad y formato de imagen
      const qualityMode = this.pdfImageQuality();
      const imgFormat = qualityMode === 'high' ? 'PNG' : 'JPEG';
      const mimeType = qualityMode === 'high' ? 'image/png' : 'image/jpeg';
      const compressionQuality = qualityMode === 'medium' ? 0.85 : 0.7;

      for (let i = 0; i < attendees.length; i++) {
        const attendee = attendees[i];

        // Calcular la ubicación en la grilla
        const pageIndex = i % itemsPerPage;
        const col = pageIndex % layout.cols;
        const row = Math.floor(pageIndex / layout.cols);

        // Si ya completamos una página, insertar una nueva
        if (i > 0 && pageIndex === 0) {
          doc.addPage();
        }

        // Si la credencial está rotada, sus dimensiones de impresión física se intercambian
        const currentCardW = layout.rotateCards ? cardH : cardW;
        const currentCardH = layout.rotateCards ? cardW : cardH;

        const x = margin + col * (currentCardW + spacing);
        const y = margin + row * (currentCardH + spacing);

        // Crear canvas temporal para dibujar la credencial de este asistente
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        // Rellenar fondo blanco si exportamos en formato JPEG (evita fondo negro por transparencia)
        if (mimeType === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0);

        const fullName = `${attendee.firstName} ${attendee.lastName}`;
        this.drawNameText(ctx, fullName, pos.nameX, pos.nameY, pos.fontSize, pos.nameMaxWidth);

        if (pos.showRole !== false) {
          ctx.font = `${Math.round(pos.fontSize * 0.75)}px sans-serif`;
          ctx.fillStyle = '#333333';
          ctx.textBaseline = 'top';
          ctx.textAlign = 'center';
          ctx.fillText(this.translateRole(attendee.role), pos.roleX, pos.roleY);
        }

        try {
          const qrDataUrl = await QRCode.toDataURL(attendee.id, {
            width: pos.qrSize,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
          const qrImg = new Image();
          await new Promise<void>((resolve) => {
            qrImg.onload = () => {
              ctx.drawImage(qrImg, pos.qrX, pos.qrY, pos.qrSize, pos.qrSize);
              resolve();
            };
            qrImg.src = qrDataUrl;
          });
        } catch {
          console.warn(`Failed to generate QR for ${attendee.id}`);
        }

        let finalCanvas = canvas;
        if (layout.rotateCards) {
          finalCanvas = this.rotateCanvas90(canvas);
        }

        // Obtener data URL con el formato y nivel de compresión correspondientes
        const imgDataUrl = finalCanvas.toDataURL(
          mimeType,
          qualityMode === 'high' ? undefined : compressionQuality,
        );
        doc.addImage(imgDataUrl, imgFormat, x, y, currentCardW, currentCardH, undefined, 'FAST');

        this.generationProgress.set(Math.round(((i + 1) / attendees.length) * 100));

        // Liberar el hilo de UI para poder renderizar la barra de progreso
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      doc.save(`credenciales-${event.slug}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      this.generating.set(false);
      this.generationProgress.set(0);
    }
  }

  // Generar y descargar 1 página con credenciales vacías (sin texto ni QR) en base a la grilla calculada
  async generateEmptyPdf(): Promise<void> {
    const event = this.selectedEvent();
    const img = this.templateImg;

    if (!event || !img) return;

    this.generating.set(true);

    try {
      const { jsPDF } = await import('jspdf');

      const format = this.pdfPageSize();
      const margin = this.pdfMargin();
      const spacing = this.pdfSpacing();
      const cardW = this.pdfCredentialWidth();
      const cardH = this.pdfCredentialHeight();

      const layout = this.calculatePdfLayout();

      // Formato y dimensiones para jsPDF
      let pdfFormat: string | [number, number] = 'a4';
      if (format === 'LETTER') {
        pdfFormat = 'letter';
      } else if (format === 'OFICIO') {
        pdfFormat = [21.6, 33.0];
      }

      const doc = new jsPDF({
        orientation: layout.pageOrientation,
        unit: 'cm',
        format: pdfFormat,
      });

      const itemsCount = layout.capacity;

      // Determinar parámetros de calidad y formato de imagen
      const qualityMode = this.pdfImageQuality();
      const imgFormat = qualityMode === 'high' ? 'PNG' : 'JPEG';
      const mimeType = qualityMode === 'high' ? 'image/png' : 'image/jpeg';
      const compressionQuality = qualityMode === 'medium' ? 0.85 : 0.7;

      // Si la credencial está rotada, rotamos el canvas de la plantilla una sola vez en memoria
      let imgDataUrl = '';
      if (layout.rotateCards) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (mimeType === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);
          const rotatedCanvas = this.rotateCanvas90(canvas);
          imgDataUrl = rotatedCanvas.toDataURL(
            mimeType,
            qualityMode === 'high' ? undefined : compressionQuality,
          );
        }
      } else {
        if (qualityMode === 'high' && this.templateDataUrl()) {
          imgDataUrl = this.templateDataUrl()!;
        } else {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (mimeType === 'image/jpeg') {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            imgDataUrl = canvas.toDataURL(mimeType, compressionQuality);
          }
        }
      }

      const currentCardW = layout.rotateCards ? cardH : cardW;
      const currentCardH = layout.rotateCards ? cardW : cardH;

      for (let i = 0; i < itemsCount; i++) {
        const col = i % layout.cols;
        const row = Math.floor(i / layout.cols);

        const x = margin + col * (currentCardW + spacing);
        const y = margin + row * (currentCardH + spacing);

        doc.addImage(imgDataUrl, imgFormat, x, y, currentCardW, currentCardH, undefined, 'FAST');
      }

      doc.save(`credenciales-vacias-${event.slug}.pdf`);
    } catch (err) {
      console.error('Error generating empty PDF:', err);
    } finally {
      this.generating.set(false);
    }
  }
}
