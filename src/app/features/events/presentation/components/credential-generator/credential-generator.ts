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
};

const ROLE_OPTIONS = [
  { label: 'Participante', value: 'ATTENDEE' },
  { label: 'Speaker', value: 'SPEAKER' },
  { label: 'Staff', value: 'ORGANIZER' },
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

  private templateImg: HTMLImageElement | null = null;

  ngOnInit(): void {
    this.loadPositions();
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
    // Filtering is handled via computed in template
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
        this.renderPreview();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  getFilteredAttendees(): Attendee[] {
    const role = this.selectedRole();
    if (!role) return this.filteredAttendees();
    return this.filteredAttendees().filter((a) => a.role === role);
  }

  translateRole(role: string): string {
    const map: Record<string, string> = {
      ATTENDEE: 'Participante',
      SPEAKER: 'Speaker',
      ORGANIZER: 'Staff',
      VOLUNTEER: 'Voluntario',
    };
    return map[role] || role;
  }

  drawNameText(
    ctx: CanvasRenderingContext2D,
    fullName: string,
    x: number,
    y: number,
    fontSize: number,
  ): void {
    const words = fullName
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    const shouldBreak = words.length >= 3 && fullName.length > 20;

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    if (shouldBreak) {
      const firstLine = `${words[0]} ${words[1]}`;
      const remaining = words.slice(2).join(' ');
      ctx.fillText(firstLine, x, y);
      ctx.fillText(remaining, x, y + fontSize);
    } else {
      ctx.fillText(fullName, x, y);
    }
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
      this.drawNameText(ctx, fullName, pos.nameX, pos.nameY, pos.fontSize);

      ctx.font = `${Math.round(pos.fontSize * 0.75)}px sans-serif`;
      ctx.fillStyle = '#333333';
      ctx.fillText(this.translateRole(previewAttendee.role), pos.roleX, pos.roleY);

      try {
        const qrDataUrl = await QRCode.toDataURL(previewAttendee.id, {
          width: pos.qrSize,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        const qrImg = new Image();
        qrImg.onload = () => {
          ctx.drawImage(qrImg, pos.qrX, pos.qrY, pos.qrSize, pos.qrSize);
        };
        qrImg.src = qrDataUrl;
      } catch {
        console.warn('Failed to generate QR for preview');
      }
    }
  }

  onPositionChange(): void {
    this.positions.update((p) => ({ ...p }));
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
      }
    } catch {
      this.positions.set({ ...DEFAULT_POSITIONS });
    }
  }

  private savePositions(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.positions()));
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
      this.drawNameText(ctx, fullName, pos.nameX, pos.nameY, pos.fontSize);

      ctx.font = `${Math.round(pos.fontSize * 0.75)}px sans-serif`;
      ctx.fillStyle = '#333333';
      ctx.fillText(this.translateRole(attendee.role), pos.roleX, pos.roleY);

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
}
