import { Component, OnInit, inject, signal, computed, viewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { Menu, MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

import { EventsRepository } from '../../../domain/events.repository';
import { RegistrationsRepository } from '../../../domain/registrations.repository';
import { RegistrationsApi } from '../../../data/registrations.api';
import {
  REGISTRATION_STATUS_OPTIONS,
  RegistrationStatus,
  parseRegistrationStatus,
  registrationStatusLabel,
  registrationStatusSeverity,
} from '../../../domain/registration-status';
import { RegistrationStatusController } from './registration-status-controller';
import { EventsApi } from '../../../data/events.api';
import { Event, Attendee, AttendeeSessionItem } from '../../../domain/event.model';
import {
  AttendeeFilters,
  EMPTY_FILTERS,
  attendeeFiltersToParams,
  attendeeFullName,
  attendeeInitials,
  computeStats,
  entryKey,
  entryLabel,
  expectsProof,
  filterAttendees,
  hasActiveFilters,
  parseAttendeeFilters,
} from '../../../domain/attendee-payment';
import {
  ATTENDEE_ROLE_OPTIONS,
  attendeeRoleLabel,
  attendeeRoleSeverity,
} from '../../../domain/attendee-role';
import { buildAttendeeExport, toCsv } from '../../../domain/attendee-export';
import { formatCustomResponseLabel } from '../../../domain/attendee-search';
import { ScanMode, ScanResult } from '../../../../checkin/domain/checkin.model';
import { CheckinRepository } from '../../../../checkin/domain/checkin.repository';
import { CheckinApi } from '../../../../checkin/data/checkin.api';
import { AuditApi } from '../../../../activity/data/audit.api';
import { AuditEntry, EMPTY_AUDIT_FILTERS } from '../../../../activity/domain/audit-entry.model';
import { AuditRepository } from '../../../../activity/domain/audit.repository';
import { AuditTimeline } from '../../../../activity/presentation/components/audit-timeline/audit-timeline';
import { AuthService } from '../../../../../core/auth/services/auth.service';
import { FeedbackService } from '../../../../../core/services/feedback.service';
import { BsPipe } from '../../../../../shared/pipes/bs.pipe';
import { MOBILE_QUERY, mediaQuerySignal } from '../../../../../shared/utils/media-query';
import { EventHeader } from '../../components/event-header/event-header';
import {
  PaymentProofDialog,
  ProofStatusChange,
} from '../../components/payment-proof-dialog/payment-proof-dialog';

/** Columnas que el organizador puede mostrar u ocultar (las demás son fijas). */
const OPTIONAL_COLUMNS: { key: string; label: string }[] = [
  { key: 'role', label: 'Rol' },
  { key: 'contact', label: 'Contacto' },
  { key: 'registeredAt', label: 'Fecha de inscripción' },
  { key: 'id', label: 'ID de inscripción' },
];

const PAGE_SIZE = 25;

@Component({
  selector: 'app-attendees-page',
  standalone: true,
  imports: [
    CommonModule,
    AuditTimeline,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    TagModule,
    DialogModule,
    MenuModule,
    SelectModule,
    MultiSelectModule,
    PaginatorModule,
    EventHeader,
    PaymentProofDialog,
    DatePipe,
    BsPipe,
  ],
  providers: [
    { provide: EventsRepository, useClass: EventsApi },
    { provide: RegistrationsRepository, useClass: RegistrationsApi },
    { provide: CheckinRepository, useClass: CheckinApi },
    RegistrationStatusController,
    { provide: AuditRepository, useClass: AuditApi },
  ],
  templateUrl: './attendees-page.html',
  styleUrl: './attendees-page.scss',
})
export class AttendeesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventsRepo = inject(EventsRepository);
  private readonly checkinRepo = inject(CheckinRepository);
  private readonly auditRepo = inject(AuditRepository);
  private readonly auth = inject(AuthService);
  private readonly feedback = inject(FeedbackService);

  /** En ≤ 768 px las filas pasan a tarjetas (mismo patrón que la lista de eventos). */
  readonly isMobile = mediaQuerySignal(MOBILE_QUERY);
  readonly pageSize = PAGE_SIZE;

  readonly event = signal<Event | null>(null);
  readonly attendees = signal<Attendee[]>([]);
  /** Carga inicial: solo ahí se reemplaza la página por un indicador. */
  readonly loading = signal<boolean>(false);
  /** Recarga con la lista a la vista. */
  readonly refreshing = signal<boolean>(false);
  readonly errorMsg = signal<string | null>(null);
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
  readonly filters = signal<AttendeeFilters>(
    parseAttendeeFilters(this.route.snapshot.queryParamMap),
  );
  readonly first = signal(0);
  readonly filteredAttendees = computed(() => filterAttendees(this.attendees(), this.filters()));
  readonly filtersActive = computed(() => hasActiveFilters(this.filters()));
  readonly pageAttendees = computed(() =>
    this.filteredAttendees().slice(this.first(), this.first() + PAGE_SIZE),
  );

  /** "Más filtros": rol, entrada, check-in y comprobante. Se abre solo si alguno está activo. */
  readonly moreFiltersOpen = signal(this.advancedFilterCount(this.filters()) > 0);
  readonly advancedCount = computed(() => this.advancedFilterCount(this.filters()));

  readonly optionalColumns = OPTIONAL_COLUMNS;
  readonly visibleOptional = signal<string[]>([]);
  readonly showColumn = (key: string): boolean => this.visibleOptional().includes(key);

  readonly statusOptions = computed(() => {
    const stats = this.stats();
    const counts: Record<RegistrationStatus, number> = {
      CONFIRMED: stats.confirmed,
      PENDING: stats.pending,
      CANCELLED: stats.cancelled,
    };
    return [
      { label: `Todos los estados (${stats.total})`, value: '' },
      ...REGISTRATION_STATUS_OPTIONS.map((o) => ({
        label: `${o.pluralLabel} (${counts[o.value]})`,
        value: o.value as string,
      })),
    ];
  });
  readonly roleOptions = [
    { label: 'Todos los roles', value: '' },
    ...ATTENDEE_ROLE_OPTIONS.map((o) => ({ label: o.label, value: o.value as string })),
  ];
  readonly checkinOptions = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Con check-in', value: 'CHECKED_IN' },
    { label: 'Sin check-in', value: 'NOT_CHECKED_IN' },
  ];
  readonly proofOptions = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Con comprobante', value: 'WITH_PROOF' },
    { label: 'Sin comprobante', value: 'WITHOUT_PROOF' },
  ];
  readonly entryOptions = computed(() => [
    { label: 'Todas las entradas', value: '' },
    ...Array.from(new Set(this.attendees().map(entryKey)))
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ label: key, value: key })),
  ]);

  /** Claves de URL que esta página escribió y cuyo eco no debe reaplicarse (evita pisar lo que se teclea). */
  private readonly writtenParams = new Set<string>();

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const next = parseAttendeeFilters(params);
      const key = JSON.stringify(attendeeFiltersToParams(next));
      if (this.writtenParams.delete(key)) return;
      if (key === JSON.stringify(attendeeFiltersToParams(this.filters()))) return;
      this.filters.set(next);
      this.first.set(0);
      if (this.advancedFilterCount(next) > 0) this.moreFiltersOpen.set(true);
    });
  }

  /** Un `?entrada=` que no existe en este evento dejaría la lista vacía sin explicación. */
  private dropUnknownEntryFilter(): void {
    const filters = this.filters();
    if (!filters.entry) return;
    if (this.entryOptions().some((o) => o.value === filters.entry)) return;
    this.applyFilters({ ...filters, entry: '' });
  }

  private advancedFilterCount(f: AttendeeFilters): number {
    return [f.role !== '', f.entry !== '', f.checkin !== 'ALL', f.proof !== 'ALL'].filter(Boolean)
      .length;
  }

  setFilter<K extends keyof AttendeeFilters>(key: K, value: AttendeeFilters[K]): void {
    this.applyFilters({ ...this.filters(), [key]: value });
  }

  clearFilters(): void {
    this.applyFilters({ ...EMPTY_FILTERS });
  }

  /** Filtros y URL van juntos: recargar o compartir el enlace conserva la vista. */
  private applyFilters(next: AttendeeFilters): void {
    this.filters.set(next);
    this.first.set(0);
    const params = attendeeFiltersToParams(next);
    this.writtenParams.add(JSON.stringify(params));
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onPage(event: PaginatorState): void {
    this.first.set(event.first ?? 0);
  }

  // KPIs sobre todos los inscritos (no cambian con los filtros); un clic en el chip filtra.
  readonly stats = computed(() => computeStats(this.attendees()));

  /** Chips de resumen. "Pendientes de pago" se destaca: es lo que hay que revisar. */
  readonly summaryChips = computed(() => {
    const stats = this.stats();
    return [
      ...REGISTRATION_STATUS_OPTIONS.map((o) => ({
        label: o.pluralLabel,
        value: { CONFIRMED: stats.confirmed, PENDING: stats.pending, CANCELLED: stats.cancelled }[
          o.value
        ],
        status: o.value as string,
        highlight: o.value === 'PENDING',
      })),
      { label: 'Con check-in', value: stats.checkedIn, status: '', highlight: false },
    ];
  });

  isChipActive(chip: { status: string }): boolean {
    return chip.status
      ? this.filters().status === chip.status
      : this.filters().checkin === 'CHECKED_IN';
  }

  toggleChip(chip: { status: string }): void {
    if (chip.status) {
      this.setFilter('status', this.filters().status === chip.status ? '' : chip.status);
    } else {
      this.setFilter('checkin', this.filters().checkin === 'CHECKED_IN' ? 'ALL' : 'CHECKED_IN');
    }
  }

  readonly fullName = attendeeFullName;
  readonly initials = attendeeInitials;
  readonly entryLabel = entryLabel;
  readonly expectsProof = expectsProof;

  // Estado de la inscripción (issue #7): tabla y detalle usan el mismo controlador.
  readonly statusCtl = inject(RegistrationStatusController);
  readonly statusMenuItems = signal<MenuItem[]>([]);
  private readonly statusMenu = viewChild<Menu>('statusMenu');
  private readonly exportMenu = viewChild<Menu>('exportMenu');

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
    const initial = !this.event();
    if (initial) this.loading.set(true);
    else this.refreshing.set(true);
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
      this.dropUnknownEntryFilter();
    } catch (err) {
      console.error(err);
      if (token === this.loadToken) {
        if (initial) {
          this.errorMsg.set('Ocurrió un error al cargar la información. Inténtalo de nuevo.');
        } else {
          this.feedback.error('No se pudo actualizar la lista. Inténtalo de nuevo.');
        }
      }
    } finally {
      if (token === this.loadToken) {
        this.loading.set(false);
        this.refreshing.set(false);
      }
    }
  }

  statusLabel(status: string): string {
    return registrationStatusLabel(status);
  }

  statusSeverity(status: string) {
    return registrationStatusSeverity(status);
  }

  roleLabel(role: string): string {
    return attendeeRoleLabel(role);
  }

  roleSeverity(role: string) {
    return attendeeRoleSeverity(role);
  }

  isCurrentStatus(attendee: Attendee, status: RegistrationStatus): boolean {
    return parseRegistrationStatus(attendee.status) === status;
  }

  openStatusMenu(event: MouseEvent, attendee: Attendee): void {
    if (!this.statusCtl.canEdit()) return;
    this.statusMenuItems.set([
      {
        label: `Inscripción de ${this.fullName(attendee)}`,
        items: this.statusCtl.options.map((o) => ({
          label: o.actionLabel,
          disabled: this.isCurrentStatus(attendee, o.value),
          state: { icon: o.icon, danger: o.requiresConfirmation },
          command: () => void this.changeStatus(attendee, o.value),
        })),
      },
    ]);
    this.statusMenu()?.toggle(event);
  }

  /** Cambia el estado (con confirmación si se anula) y sincroniza tabla y detalle con lo guardado. */
  async changeStatus(
    attendee: Attendee,
    status: RegistrationStatus,
    options?: { skipConfirmation?: boolean },
  ): Promise<boolean> {
    const current = this.attendees().find((a) => a.id === attendee.id) ?? attendee;
    const saved = await this.statusCtl.change(
      {
        id: current.id,
        status: current.status,
        displayName: `${current.firstName} ${current.lastName}`.trim() || current.email,
        detail: current.ticketName,
      },
      status,
      options,
    );
    if (!saved) return false;

    this.patchAttendee(saved.id, { status: saved.status });
    return true;
  }

  reload(): void {
    const id = this.event()?.id ?? this.route.snapshot.paramMap.get('id');
    if (id) void this.loadData(id);
  }

  goBack(): void {
    this.router.navigate(['/events']);
  }

  /** Etiqueta del formulario del evento; si el campo ya no existe, una versión legible de la clave. */
  responseLabel(key: string): string {
    return (
      this.event()?.formFields.find((f) => f.key === key)?.label ?? formatCustomResponseLabel(key)
    );
  }

  responseEntries(attendee: Attendee): { key: string; label: string; value: unknown }[] {
    return Object.entries(attendee.customResponses ?? {})
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([key, value]) => ({ key, label: this.responseLabel(key), value }));
  }

  // Revisión de comprobantes: cola fija de ids al abrir (sigue estable aunque cambien los filtros)
  readonly proofQueue = signal<string[]>([]);
  readonly proofId = signal<string | null>(null);
  readonly proofBusy = computed(() => {
    const id = this.proofId();
    return !!id && this.statusCtl.isSaving(id);
  });
  readonly proofError = computed(() => {
    const err = this.statusCtl.lastError();
    return err && err.id === this.proofId() ? err.message : null;
  });
  readonly proofAttendee = computed(() => {
    const id = this.proofId();
    return id ? (this.attendees().find((a) => a.id === id) ?? null) : null;
  });
  readonly proofPosition = computed(() => {
    const id = this.proofId();
    return id ? this.proofQueue().indexOf(id) + 1 : 0;
  });
  readonly pendingWithProof = computed(() =>
    this.attendees().filter(
      (a) => !!a.paymentProofUrl && parseRegistrationStatus(a.status) === 'PENDING',
    ),
  );

  openProof(attendee: Attendee): void {
    if (!attendee.paymentProofUrl) return;
    const queue = this.filteredAttendees()
      .filter((a) => !!a.paymentProofUrl)
      .map((a) => a.id);
    this.proofQueue.set(queue.includes(attendee.id) ? queue : [attendee.id]);
    this.proofId.set(attendee.id);
  }

  /** Cola de comprobantes de pagos pendientes, independiente de los filtros de la lista. */
  openPendingReview(): void {
    const queue = this.pendingWithProof().map((a) => a.id);
    if (queue.length === 0) return;
    this.proofQueue.set(queue);
    this.proofId.set(queue[0]);
  }

  closeProof(): void {
    this.proofId.set(null);
  }

  stepProof(delta: -1 | 1): void {
    const queue = this.proofQueue();
    const next = queue[queue.indexOf(this.proofId() ?? '') + delta];
    if (!next) return;
    this.proofId.set(next);
  }

  /** Pasa al siguiente comprobante pendiente de la cola; si no queda ninguno, cierra el visor. */
  private advanceProof(currentId: string): void {
    const queue = this.proofQueue();
    const index = queue.indexOf(currentId);
    const isPending = (id: string) =>
      parseRegistrationStatus(this.attendees().find((a) => a.id === id)?.status) === 'PENDING';
    const next = [...queue.slice(index + 1), ...queue.slice(0, Math.max(index, 0))].find(isPending);
    if (next) {
      this.proofId.set(next);
    } else {
      this.closeProof();
      this.feedback.success('No quedan comprobantes pendientes de revisar.');
    }
  }

  /**
   * Desde el visor: mismo camino que la tabla y el detalle (RegistrationStatusController), sin
   * repetir la confirmación que ya pidió el visor. Al resolver un pago pendiente pasa al siguiente
   * de la cola; cualquier otro cambio (desestimar un pago, restaurar) se queda en la misma persona.
   */
  async changeFromProof({ attendee, status }: ProofStatusChange): Promise<void> {
    const wasPending = parseRegistrationStatus(attendee.status) === 'PENDING';
    const saved = await this.changeStatus(attendee, status, { skipConfirmation: true });
    if (saved && wasPending) this.advanceProof(attendee.id);
  }

  /** Actualiza la fila en la lista y en el detalle abierto, si es la misma inscripción. */
  private patchAttendee(id: string, changes: Partial<Attendee>): void {
    this.attendees.update((list) => list.map((a) => (a.id === id ? { ...a, ...changes } : a)));
    const selected = this.selectedAttendee();
    if (selected?.id === id) {
      this.selectedAttendee.set({ ...selected, ...changes });
      // El cambio recién guardado también es parte del historial que se está viendo.
      if (this.showDetailModal()) void this.loadHistory(id);
    }
  }

  isUrl(val: unknown): boolean {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  }

  responseText(val: unknown): string {
    if (val === true || val === 'true') return 'Sí';
    if (val === false || val === 'false') return 'No';
    return Array.isArray(val) ? val.join(', ') : String(val);
  }

  // Exportación (siempre sobre los inscritos filtrados)
  readonly exportItems = computed<MenuItem[]>(() => {
    const count = this.filteredAttendees().length;
    const suffix = this.filtersActive() ? ` (${count})` : '';
    return [
      {
        label: `CSV${suffix}`,
        icon: 'description',
        disabled: count === 0,
        command: () => this.exportToCSV(),
      },
      {
        label: `Excel${suffix}`,
        icon: 'table_view',
        disabled: count === 0,
        command: () => void this.exportToExcel(),
      },
    ];
  });

  toggleExportMenu(event: MouseEvent): void {
    this.exportMenu()?.toggle(event);
  }

  private exportName(extension: string): string {
    return `asistentes_${this.event()?.slug || 'asistentes'}.${extension}`;
  }

  exportToCSV(): void {
    const list = this.filteredAttendees();
    if (list.length === 0) return;
    try {
      const table = buildAttendeeExport(list, this.event()?.formFields ?? []);
      const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), toCsv(table)], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', this.exportName('csv'));
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.feedback.success(`CSV descargado: ${list.length} inscritas.`);
    } catch (err) {
      console.error('Error al exportar a CSV:', err);
      this.feedback.error('No se pudo generar el CSV. Inténtalo de nuevo.');
    }
  }

  async exportToExcel(): Promise<void> {
    const list = this.filteredAttendees();
    if (list.length === 0) return;
    try {
      const table = buildAttendeeExport(list, this.event()?.formFields ?? []);
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistentes');
      XLSX.writeFile(workbook, this.exportName('xlsx'));
      this.feedback.success(`Excel descargado: ${list.length} inscritas.`);
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
      this.feedback.error('No se pudo generar el Excel. Inténtalo de nuevo.');
    }
  }

  /** Solo SUPERADMIN: quién hizo qué con la inscripción abierta en el detalle. */
  readonly history = signal<AuditEntry[]>([]);
  readonly loadingHistory = signal(false);
  readonly historyError = signal<string | null>(null);

  private async loadHistory(registrationId: string): Promise<void> {
    if (!this.statusCtl.canEdit()) return;
    this.loadingHistory.set(true);
    this.historyError.set(null);
    try {
      const page = await this.auditRepo.list({ ...EMPTY_AUDIT_FILTERS, registrationId }, 50, 0);
      if (this.selectedAttendee()?.id === registrationId) this.history.set(page.entries);
    } catch {
      if (this.selectedAttendee()?.id === registrationId) {
        this.historyError.set('No se pudo cargar el historial.');
      }
    } finally {
      this.loadingHistory.set(false);
    }
  }

  async openAttendeeDetail(attendee: Attendee): Promise<void> {
    const token = ++this.detailToken;
    this.actionError.set(null);
    this.selectedAttendee.set(attendee);
    this.attendeeSessions.set([]);
    this.history.set([]);
    this.showDetailModal.set(true);
    void this.loadHistory(attendee.id);

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

  /** Mismo flujo (verificación + registro) que el escaneo de QR y el modo manual de /checkin. */
  private async registerScan(
    attendee: Attendee,
    mode: ScanMode,
    sessionId: string | null,
    fallbackError: string,
  ): Promise<ScanResult | null> {
    const eventId = this.event()?.id;
    if (!eventId) return null;

    this.actionLoading.set(true);
    this.actionError.set(null);
    try {
      const result = await this.checkinRepo.registerScan(
        attendee.id,
        eventId,
        mode,
        sessionId,
        this.auth.user()?.id || null,
      );
      if (!result.success) this.actionError.set(result.message);
      return result;
    } catch (err) {
      console.error(`Error in manual ${mode}:`, err);
      this.actionError.set(fallbackError);
      return null;
    } finally {
      this.actionLoading.set(false);
    }
  }

  async doManualCheckin(): Promise<void> {
    const attendee = this.selectedAttendee();
    if (!attendee || !this.canCheckin(attendee) || attendee.checkedIn) return;

    const result = await this.registerScan(
      attendee,
      'checkin',
      null,
      'No se pudo registrar el check-in. Inténtalo de nuevo.',
    );
    if (result?.success) {
      this.patchAttendee(attendee.id, {
        checkedIn: true,
        checkedInAt: result.scannedAt || new Date(),
      });
      this.feedback.success(`Check-in registrado: ${this.fullName(attendee)}.`);
    }
  }

  async doManualRefrigerio(): Promise<void> {
    const attendee = this.selectedAttendee();
    if (!attendee || !this.canCheckin(attendee) || attendee.refrigerioDelivered) return;

    const result = await this.registerScan(
      attendee,
      'refrigerio',
      null,
      'No se pudo registrar la entrega. Inténtalo de nuevo.',
    );
    if (result?.success) {
      this.patchAttendee(attendee.id, {
        refrigerioDelivered: true,
        refrigerioDeliveredAt: result.scannedAt || new Date(),
      });
      this.feedback.success(`Refrigerio entregado: ${this.fullName(attendee)}.`);
    }
  }

  async doManualSessionCheckin(session: AttendeeSessionItem): Promise<void> {
    const attendee = this.selectedAttendee();
    if (!attendee || !this.canCheckin(attendee) || session.asistio) return;

    const result = await this.registerScan(
      attendee,
      'session',
      session.sessionId,
      'No se pudo registrar el ingreso a la sesión.',
    );
    if (result?.success) {
      const now = result.scannedAt || new Date();
      this.attendeeSessions.update((list) =>
        list.map((s) =>
          s.sessionId === session.sessionId ? { ...s, asistio: true, checkedInAt: now } : s,
        ),
      );
      this.feedback.success(`Ingreso registrado: ${session.sessionTitle}.`);
    }
  }
}
