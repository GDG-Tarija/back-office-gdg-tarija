import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';

import { AuthService } from '../../../../../core/auth/services/auth.service';
import { EventsRepository } from '../../../domain/events.repository';
import { EventsApi } from '../../../data/events.api';
import { Event, Attendee, AttendeeSessionItem } from '../../../domain/event.model';
import {
  AttendeeFilters,
  EMPTY_FILTERS,
  attendeeFullName,
  attendeeInitials,
  computeStats,
  entryKey,
  entryLabel,
  expectsProof,
  filterAttendees,
  hasActiveFilters,
} from '../../../domain/attendee-payment';
import { PaymentProofDialog } from '../../components/payment-proof-dialog/payment-proof-dialog';

@Component({
  selector: 'app-attendees-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ProgressSpinnerModule,
    TagModule,
    DialogModule,
    SelectModule,
    PaymentProofDialog,
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
  private readonly auth = inject(AuthService);

  /** Solo SUPERADMIN cancela inscripciones (RLS sigue siendo la seguridad real). */
  readonly isSuperadmin = computed(() => this.auth.role() === 'SUPERADMIN');
  readonly confirmingCancel = signal<boolean>(false);
  readonly cancelError = signal<string | null>(null);

  readonly event = signal<Event | null>(null);
  readonly attendees = signal<Attendee[]>([]);
  readonly loading = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);
  readonly copiedId = signal<string | null>(null);
  private loadToken = 0;
  private detailToken = 0;
  readonly actionError = signal<string | null>(null);

  // Modal de detalle y asistencias
  readonly selectedAttendee = signal<Attendee | null>(null);
  readonly showDetailModal = signal<boolean>(false);
  readonly attendeeSessions = signal<AttendeeSessionItem[]>([]);
  readonly loadingSessions = signal<boolean>(false);
  readonly actionLoading = signal<boolean>(false);

  // Filtros de la lista (se aplican sobre todos los inscritos, no solo la página visible)
  readonly filters = signal<AttendeeFilters>({ ...EMPTY_FILTERS });
  readonly first = signal(0);
  readonly filteredAttendees = computed(() => filterAttendees(this.attendees(), this.filters()));
  readonly filtersActive = computed(() => hasActiveFilters(this.filters()));

  readonly statusOptions = [
    { label: 'Todos los estados', value: '' },
    { label: 'Confirmado', value: 'CONFIRMED' },
    { label: 'Pendiente', value: 'PENDING' },
    { label: 'Cancelado', value: 'CANCELLED' },
  ];
  readonly roleOptions = [
    { label: 'Todos los roles', value: '' },
    { label: 'Asistente', value: 'ATTENDEE' },
    { label: 'Expositor', value: 'SPEAKER' },
    { label: 'Voluntario', value: 'VOLUNTEER' },
    { label: 'Staff', value: 'STAFF' },
    { label: 'Organizador', value: 'ORGANIZER' },
  ];
  readonly checkinOptions = [
    { label: 'Check-in: todos', value: 'ALL' },
    { label: 'Ya asistió', value: 'CHECKED_IN' },
    { label: 'Aún no asistió', value: 'NOT_CHECKED_IN' },
  ];
  readonly proofOptions = [
    { label: 'Comprobante: todos', value: 'ALL' },
    { label: 'Con comprobante', value: 'WITH_PROOF' },
    { label: 'Sin comprobante', value: 'WITHOUT_PROOF' },
  ];
  readonly entryOptions = computed(() => [
    { label: 'Todas las entradas', value: '' },
    ...Array.from(new Set(this.attendees().map(entryKey)))
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ label: key, value: key })),
  ]);

  setFilter<K extends keyof AttendeeFilters>(key: K, value: AttendeeFilters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.first.set(0);
  }

  clearFilters(): void {
    this.filters.set({ ...EMPTY_FILTERS });
    this.first.set(0);
  }

  copyToClipboard(id: string): void {
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(id)
      .then(() => {
        this.copiedId.set(id);
        setTimeout(() => {
          if (this.copiedId() === id) {
            this.copiedId.set(null);
          }
        }, 2000);
      })
      .catch(() => undefined);
  }

  // KPIs sobre todos los inscritos (no cambian con los filtros); un clic en la tarjeta filtra.
  readonly stats = computed(() => computeStats(this.attendees()));

  readonly fullName = attendeeFullName;
  readonly initials = attendeeInitials;
  readonly entryLabel = entryLabel;
  readonly expectsProof = expectsProof;

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
    const token = ++this.loadToken;
    this.loading.set(true);
    this.errorMsg.set(null);

    try {
      const [eventData, attendeesData] = await Promise.all([
        this.eventsRepo.getEventById(eventId),
        this.eventsRepo.getAttendees(eventId),
      ]);

      if (token !== this.loadToken) return;
      if (!eventData) {
        this.errorMsg.set('El evento solicitado no existe o fue eliminado.');
        return;
      }

      this.event.set(eventData);
      this.attendees.set(attendeesData);
    } catch (err) {
      console.error(err);
      if (token === this.loadToken) {
        this.errorMsg.set('Ocurrió un error al cargar la información. Intente de nuevo.');
      }
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }

  reload(): void {
    const id = this.event()?.id ?? this.route.snapshot.paramMap.get('id');
    if (id) void this.loadData(id);
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

  // Revisión de comprobantes: cola fija de ids al abrir (sigue estable aunque cambien los filtros)
  readonly proofQueue = signal<string[]>([]);
  readonly proofId = signal<string | null>(null);
  readonly proofBusy = signal(false);
  readonly proofError = signal<string | null>(null);
  readonly proofAttendee = computed(() => {
    const id = this.proofId();
    return id ? (this.attendees().find((a) => a.id === id) ?? null) : null;
  });
  readonly proofPosition = computed(() => {
    const id = this.proofId();
    return id ? this.proofQueue().indexOf(id) + 1 : 0;
  });

  openProof(attendee: Attendee): void {
    if (!attendee.paymentProofUrl) return;
    const queue = this.filteredAttendees()
      .filter((a) => !!a.paymentProofUrl)
      .map((a) => a.id);
    this.proofQueue.set(queue.includes(attendee.id) ? queue : [attendee.id]);
    this.proofError.set(null);
    this.proofId.set(attendee.id);
  }

  closeProof(): void {
    this.proofId.set(null);
    this.proofError.set(null);
  }

  stepProof(delta: -1 | 1): void {
    const queue = this.proofQueue();
    const next = queue[queue.indexOf(this.proofId() ?? '') + delta];
    if (!next) return;
    this.proofError.set(null);
    this.proofId.set(next);
  }

  async confirmPayment(attendee: Attendee): Promise<void> {
    if (!this.isSuperadmin() || this.proofBusy()) return;
    this.proofBusy.set(true);
    this.proofError.set(null);
    try {
      await this.eventsRepo.confirmPendingRegistration(attendee.id);
      this.patchAttendee(attendee.id, { status: 'CONFIRMED' });
    } catch (err) {
      this.proofError.set(
        err instanceof Error ? err.message : 'No se pudo confirmar el pago. Intenta de nuevo.',
      );
    } finally {
      this.proofBusy.set(false);
    }
  }

  async cancelFromProof(attendee: Attendee): Promise<void> {
    if (!this.isSuperadmin() || this.proofBusy()) return;
    this.proofBusy.set(true);
    this.proofError.set(null);
    try {
      await this.eventsRepo.cancelPendingRegistration(attendee.id);
      this.patchAttendee(attendee.id, { status: 'CANCELLED' });
    } catch (err) {
      this.proofError.set(
        err instanceof Error ? err.message : 'No se pudo cancelar la inscripción.',
      );
    } finally {
      this.proofBusy.set(false);
    }
  }

  /** Actualiza la fila en la lista y en el detalle abierto, si es la misma inscripción. */
  private patchAttendee(id: string, changes: Partial<Attendee>): void {
    this.attendees.update((list) => list.map((a) => (a.id === id ? { ...a, ...changes } : a)));
    const selected = this.selectedAttendee();
    if (selected?.id === id) this.selectedAttendee.set({ ...selected, ...changes });
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
    const attendeesList = this.filteredAttendees();
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
      'ticket_phase',
      'amount_due',
      'status',
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
      // Evita que Excel interprete texto del usuario como fórmula (=, +, -, @).
      if (/^[=+\-@]/.test(str) && !/^[+-]?\d/.test(str)) str = `'${str}`;
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
      const ticketPhase = attendee.phaseName ?? '';
      const amountDue = attendee.couponId ? '0 (cupón)' : String(attendee.amountDue);
      const status = this.translateStatus(attendee.status);

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
        ticketPhase,
        amountDue,
        status,
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
    const attendeesList = this.filteredAttendees();
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
        Fase: attendee.phaseName ?? '',
        'Precio del paquete (Bs)': attendee.ticketPrice,
        'Monto a pagar (Bs)': attendee.amountDue,
        Cupón: attendee.couponCode ?? (attendee.couponId ? 'Sí' : ''),
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

  async openAttendeeDetail(attendee: Attendee): Promise<void> {
    const token = ++this.detailToken;
    this.confirmingCancel.set(false);
    this.cancelError.set(null);
    this.actionError.set(null);
    this.selectedAttendee.set(attendee);
    this.attendeeSessions.set([]);
    this.showDetailModal.set(true);

    const eventId = this.event()?.id;
    if (!eventId) {
      this.loadingSessions.set(false);
      return;
    }
    this.loadingSessions.set(true);
    try {
      const sessions = await this.eventsRepo.getAttendeeSessions(
        eventId,
        attendee.id,
        attendee.userId,
      );
      if (token === this.detailToken) this.attendeeSessions.set(sessions);
    } catch (err) {
      console.error('Error loading attendee sessions:', err);
      if (token === this.detailToken) this.attendeeSessions.set([]);
    } finally {
      if (token === this.detailToken) this.loadingSessions.set(false);
    }
  }

  /** El check-in y la entrega solo aplican a inscripciones confirmadas. */
  canCheckin(attendee: Attendee): boolean {
    return attendee.status?.toUpperCase() === 'CONFIRMED';
  }

  /** Una inscripción pendiente (sin pago confirmado) se puede cancelar para liberar el cupo. */
  canCancel(attendee: Attendee): boolean {
    return this.isSuperadmin() && attendee.status?.toUpperCase() === 'PENDING';
  }

  async doCancelRegistration(): Promise<void> {
    const attendee = this.selectedAttendee();
    if (!attendee || !this.canCancel(attendee)) return;

    this.actionLoading.set(true);
    this.cancelError.set(null);
    try {
      await this.eventsRepo.cancelPendingRegistration(attendee.id);
      this.patchAttendee(attendee.id, { status: 'CANCELLED' });
      this.confirmingCancel.set(false);
    } catch (err) {
      this.cancelError.set(
        err instanceof Error ? err.message : 'No se pudo cancelar la inscripción.',
      );
    } finally {
      this.actionLoading.set(false);
    }
  }

  async doManualCheckin(): Promise<void> {
    const attendee = this.selectedAttendee();
    if (!attendee || !this.canCheckin(attendee) || attendee.checkedIn) return;

    this.actionLoading.set(true);
    this.actionError.set(null);
    try {
      const success = await this.eventsRepo.registerManualCheckin(attendee.id);
      if (success) {
        this.patchAttendee(attendee.id, { checkedIn: true, checkedInAt: new Date() });
      } else {
        this.actionError.set('No se pudo registrar el check-in. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error in manual checkin:', err);
      this.actionError.set('No se pudo registrar el check-in. Intenta de nuevo.');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async doManualRefrigerio(): Promise<void> {
    const attendee = this.selectedAttendee();
    if (!attendee || !this.canCheckin(attendee) || attendee.refrigerioDelivered) return;

    this.actionLoading.set(true);
    this.actionError.set(null);
    try {
      const success = await this.eventsRepo.registerManualRefrigerio(attendee.id);
      if (success) {
        this.patchAttendee(attendee.id, {
          refrigerioDelivered: true,
          refrigerioDeliveredAt: new Date(),
        });
      } else {
        this.actionError.set('No se pudo registrar la entrega. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('Error in manual refrigerio:', err);
      this.actionError.set('No se pudo registrar la entrega. Intenta de nuevo.');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async doManualSessionCheckin(session: AttendeeSessionItem): Promise<void> {
    const attendee = this.selectedAttendee();
    if (!attendee || !this.canCheckin(attendee) || session.asistio) return;

    this.actionLoading.set(true);
    this.actionError.set(null);
    try {
      const success = await this.eventsRepo.registerManualSessionCheckin(
        attendee.id,
        session.sessionId,
        attendee.userId,
      );

      if (success) {
        const now = new Date();
        this.attendeeSessions.update((list) =>
          list.map((s) =>
            s.sessionId === session.sessionId ? { ...s, asistio: true, checkedInAt: now } : s,
          ),
        );
      }
    } catch (err) {
      console.error('Error in manual session checkin:', err);
      this.actionError.set('No se pudo registrar el ingreso a la sesión.');
    } finally {
      this.actionLoading.set(false);
    }
  }
}
