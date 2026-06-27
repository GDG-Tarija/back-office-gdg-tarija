import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { EventsRepository } from '../../../domain/events.repository';
import { EventsApi } from '../../../data/events.api';
import { Event, Attendee } from '../../../domain/event.model';

@Component({
  selector: 'app-attendees-page',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ProgressSpinnerModule,
    TagModule,
    DatePipe,
    CurrencyPipe,
  ],
  providers: [{ provide: EventsRepository, useClass: EventsApi }],
  templateUrl: './attendees-page.html',
  styleUrl: './attendees-page.scss',
})
export class AttendeesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsRepo = inject(EventsRepository);

  readonly event = signal<Event | null>(null);
  readonly attendees = signal<Attendee[]>([]);
  readonly loading = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);
  readonly copiedId = signal<string | null>(null);

  // Global table search filter
  readonly globalFilter = signal<string>('');

  copyToClipboard(id: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).then(() => {
        this.copiedId.set(id);
        setTimeout(() => {
          if (this.copiedId() === id) {
            this.copiedId.set(null);
          }
        }, 2000);
      });
    }
  }

  // Métricas computadas para las tarjetas del header
  readonly totalConfirmed = computed(
    () => this.attendees().filter((a) => a.status?.toUpperCase() === 'CONFIRMED').length,
  );

  readonly totalCheckedIn = computed(() => this.attendees().filter((a) => a.checkedIn).length);

  readonly totalPending = computed(
    () => this.attendees().filter((a) => a.status?.toUpperCase() === 'PENDING').length,
  );

  readonly checkinRate = computed(() => {
    const confirmed = this.totalConfirmed();
    return confirmed > 0 ? Math.round((this.totalCheckedIn() / confirmed) * 100) : 0;
  });

  // unique custom response keys computed from all attendees
  readonly customResponseKeys = computed<string[]>(() => {
    const keysSet = new Set<string>();
    this.attendees().forEach((attendee) => {
      if (attendee.customResponses) {
        Object.keys(attendee.customResponses).forEach((k) => keysSet.add(k));
      }
    });

    const orderedKeys = [
      'discovery_source',
      'experience_level',
      'has_laptop',
      'dietary_restrictions',
      'additional_notes',
    ];

    return Array.from(keysSet).sort((a, b) => {
      const idxA = orderedKeys.indexOf(a);
      const idxB = orderedKeys.indexOf(b);

      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB;
      }
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadData(id);
    } else {
      this.errorMsg.set('Identificador de evento no válido.');
    }
  }

  async loadData(eventId: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);

    try {
      const [eventData, attendeesData] = await Promise.all([
        this.eventsRepo.getEventById(eventId),
        this.eventsRepo.getAttendees(eventId),
      ]);

      if (!eventData) {
        this.errorMsg.set('El evento solicitado no existe o fue eliminado.');
        return;
      }

      this.event.set(eventData);
      this.attendees.set(attendeesData);
    } catch (err) {
      console.error(err);
      this.errorMsg.set('Ocurrió un error al cargar la información. Intente de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/events']);
  }

  getRoleSeverity(role: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
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

  getStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return 'success';
      case 'PENDING':
        return 'warn';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  translateRole(role: string): string {
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

  translateStatus(status: string): string {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return 'Confirmado';
      case 'PENDING':
        return 'Pendiente';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return status || 'Desconocido';
    }
  }

  formatResponseKey(key: string | number | symbol): string {
    const keyStr = String(key);
    const lowerKey = keyStr.toLowerCase();

    const commonKeys: Record<string, string> = {
      t_shirt_size: 'Talla de polera',
      tshirt: 'Talla de polera',
      tshirt_size: 'Talla de polera',
      polera: 'Talla de polera',
      camiseta: 'Talla de camiseta',
      occupation: 'Ocupación',
      organization: 'Institución / Organización',
      university: 'Universidad / Colegio',
      company: 'Empresa',
      dietary: 'Requerimientos alimentarios',
      food_restrictions: 'Restricciones alimenticias',
      city: 'Ciudad de residencia',
      experience: 'Nivel de experiencia',
      interest: 'Área de interés',
      how_did_you_know: '¿Cómo te enteraste?',
      how_heard: '¿Cómo te enteraste?',
      first_time: '¿Es tu primera vez?',
      github: 'Usuario de GitHub',
      linkedin: 'Perfil de LinkedIn',
      has_laptop: '¿Cuentas con una laptop?',
      discovery_source: '¿Cómo se enteró del evento?',
      experience_level: 'Nivel de experiencia',
      dietary_restrictions: 'Restricciones alimentarias',
      additional_notes: '¿Tiene alguna consulta o duda?',
    };

    const translation = commonKeys[lowerKey];
    if (translation) {
      return translation;
    }

    // Detección genérica de preguntas sobre computadora/laptop
    if (
      lowerKey.includes('compu') ||
      lowerKey.includes('laptop') ||
      lowerKey.includes('computer')
    ) {
      return '¿Llevará computadora?';
    }

    return keyStr
      .replace(/[-_]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  hasCustomResponses(attendee: Attendee): boolean {
    return !!attendee.customResponses && Object.keys(attendee.customResponses).length > 0;
  }

  isImageProof(url: string | null): boolean {
    if (!url) return false;
    const cleanedUrl = url.split('?')[0].toLowerCase();
    return (
      cleanedUrl.endsWith('.jpg') ||
      cleanedUrl.endsWith('.jpeg') ||
      cleanedUrl.endsWith('.png') ||
      cleanedUrl.endsWith('.webp') ||
      cleanedUrl.endsWith('.gif') ||
      cleanedUrl.endsWith('.svg') ||
      url.includes('/storage/v1/object/public/')
    );
  }

  openProof(url: string | null): void {
    if (url) {
      window.open(url, '_blank');
    }
  }

  isUrl(val: unknown): boolean {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  }

  isBooleanTrue(val: unknown): boolean {
    if (val === true || val === 'true') return true;
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      return lower === 'yes' || lower === 'si' || lower === 'sí' || lower === 'on' || lower === '1';
    }
    return false;
  }

  isBooleanFalse(val: unknown): boolean {
    if (val === false || val === 'false') return true;
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      return lower === 'no' || lower === 'off' || lower === '0';
    }
    return false;
  }

  exportToCSV(): void {
    const attendeesList = this.attendees();
    if (!attendeesList || attendeesList.length === 0) {
      return;
    }

    const headers = [
      'first_name',
      'last_name',
      'email',
      'checked_in',
      'job_title',
      'company',
      'ticket_type',
      'trae_computadora',
    ];

    const getValueByPattern = (
      customResponses: Record<string, unknown> | null,
      patterns: string[],
    ): string => {
      if (!customResponses) return '';
      const keys = Object.keys(customResponses);

      // 1. Try exact or lowercase matches first
      for (const pattern of patterns) {
        const lowercasePattern = pattern.toLowerCase();
        for (const key of keys) {
          if (key.toLowerCase() === lowercasePattern) {
            return String(customResponses[key] ?? '');
          }
        }
      }

      // 2. Try partial matches (key contains pattern or pattern contains key)
      for (const pattern of patterns) {
        const lowercasePattern = pattern.toLowerCase();
        for (const key of keys) {
          const lowercaseKey = key.toLowerCase();
          if (lowercaseKey.includes(lowercasePattern) || lowercasePattern.includes(lowercaseKey)) {
            return String(customResponses[key] ?? '');
          }
        }
      }

      return '';
    };

    const escapeCSVValue = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      str = str.replace(/"/g, '""');
      if (
        str.includes(',') ||
        str.includes('"') ||
        str.includes('\n') ||
        str.includes('\r') ||
        str.includes('\t')
      ) {
        return `"${str}"`;
      }
      return str;
    };

    const rows = attendeesList.map((attendee) => {
      const responses = attendee.customResponses;

      const firstName = attendee.firstName;
      const lastName = attendee.lastName;
      const email = attendee.email;
      const checkedIn = attendee.checkedIn ? 'TRUE' : 'FALSE';

      const jobTitle = getValueByPattern(responses, [
        'job_title',
        'occupation',
        'ocupacion',
        'ocupación',
        'cargo',
        'trabajo',
        'puesto',
        'title',
      ]);

      const company = getValueByPattern(responses, [
        'company',
        'organization',
        'empresa',
        'institucion',
        'institución',
        'organizacion',
        'organización',
      ]);

      const ticketType = attendee.ticketName;

      const rawBringsComputer = getValueByPattern(responses, [
        'computer',
        'laptop',
        'computadora',
        'compu',
        'has_laptop',
        'llevar_computadora',
        'traeras_computadora',
        'llevaras_computadora',
        'llevaras_laptop',
      ]);
      const bringsComputer = this.isBooleanTrue(rawBringsComputer)
        ? 'Sí'
        : this.isBooleanFalse(rawBringsComputer)
          ? 'No'
          : String(rawBringsComputer ?? '');

      return [
        firstName,
        lastName,
        email,
        checkedIn,
        jobTitle,
        company,
        ticketType,
        bringsComputer,
      ].map(escapeCSVValue);
    });

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const eventSlug = this.event()?.slug || 'asistentes';
    link.setAttribute('href', url);
    link.setAttribute('download', `asistentes_${eventSlug}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async exportToExcel(): Promise<void> {
    const attendeesList = this.attendees();
    if (!attendeesList || attendeesList.length === 0) {
      return;
    }

    const customKeys = this.customResponseKeys();

    const dataRows = attendeesList.map((attendee) => {
      const responses = attendee.customResponses;

      const rowData: Record<string, string | number> = {
        Nombre: attendee.firstName,
        Apellido: attendee.lastName,
        Correo: attendee.email,
        Teléfono: attendee.phone || '',
        Rol: this.translateRole(attendee.role),
        Estado: this.translateStatus(attendee.status),
        'Tipo de Entrada': attendee.ticketName,
        'Precio ($)': attendee.ticketPrice,
        '¿Asistió?': attendee.checkedIn ? 'Sí' : 'No',
        'Fecha Registro': attendee.registeredAt
          ? new Date(attendee.registeredAt).toLocaleString()
          : '',
        'Comprobante de Pago': attendee.paymentProofUrl || '',
      };

      customKeys.forEach((key) => {
        const columnHeader = this.formatResponseKey(key);
        const rawValue = responses ? responses[key] : '';

        const formattedValue = this.isBooleanTrue(rawValue)
          ? 'Sí'
          : this.isBooleanFalse(rawValue)
            ? 'No'
            : String(rawValue ?? '');

        rowData[columnHeader] = formattedValue;
      });

      return rowData;
    });

    try {
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistentes');

      const eventSlug = this.event()?.slug || 'asistentes';
      XLSX.writeFile(workbook, `asistentes_${eventSlug}.xlsx`);
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
    }
  }
}
