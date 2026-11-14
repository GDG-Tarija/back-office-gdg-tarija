import { Injectable, inject } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { SUPABASE } from '../../../core/supabase/supabase.client';
import { blocksAttendance } from '../../events/domain/registration-status';
import { CheckinRepository } from '../domain/checkin.repository';
import {
  Session,
  ScanResult,
  ScanMode,
  UndoScanInput,
  UndoScanResult,
} from '../domain/checkin.model';
import { Attendee, Event } from '../../events/domain/event.model';
import { EventsApi } from '../../events/data/events.api';

const UNDO_EXPIRED_MESSAGE =
  'No se pudo deshacer (pasaron más de 60 s). Avisa a un organizador para corregirlo.';
const UNDO_NETWORK_MESSAGE =
  'No se pudo deshacer por un problema de conexión. Vuelve a intentarlo.';

@Injectable({
  providedIn: 'root',
})
export class CheckinApi implements CheckinRepository {
  private readonly supabase = inject(SUPABASE);
  private readonly eventsApi = inject(EventsApi);

  async getEvents(): Promise<Event[]> {
    return this.eventsApi.getEvents();
  }

  async getAttendees(eventId: string): Promise<Attendee[]> {
    return this.eventsApi.getAttendees(eventId);
  }

  async getSessions(eventId: string): Promise<Session[]> {
    const { data, error } = await (this.supabase
      .from('sessions')
      .select('*')
      .eq('event_id', eventId)
      .order('title', { ascending: true }) as unknown as Promise<{
      data:
        | {
            id: string;
            event_id: string;
            title: string;
            capacity: number;
            date: string | null;
            start_time: string | null;
            end_time: string | null;
            speaker: string | null;
          }[]
        | null;
      error: PostgrestError | null;
    }>);

    if (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }

    return (data || []).map((row) => {
      const timeStr = row.start_time ? `${row.start_time.substring(0, 5)} · ` : '';
      const speakerStr = row.speaker ? ` · ${row.speaker}` : '';
      const displayLabel = `${timeStr}${row.title}${speakerStr}`;

      return {
        id: row.id,
        eventId: row.event_id,
        title: row.title,
        capacity: row.capacity,
        date: row.date,
        startTime: row.start_time,
        endTime: row.end_time,
        speaker: row.speaker,
        displayLabel,
      };
    });
  }

  async getCheckinStats(eventId: string): Promise<{
    checkedInCount: number;
    refrigerioCount: number;
    totalRegistered: number;
  } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;

    const countScans = (scanType: string) =>
      client
        .from('scan_logs')
        .select('id, registrations!inner(event_id)', { count: 'exact', head: true })
        .eq('registrations.event_id', eventId)
        .eq('scan_type', scanType);

    try {
      const [regsRes, checkinRes, refrigerioRes] = await Promise.all([
        client
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('status', 'CONFIRMED'),
        countScans('checkin'),
        countScans('refrigerio'),
      ]);

      const failed = [regsRes, checkinRes, refrigerioRes].find((res) => res.error);
      if (failed) {
        console.error('Error fetching check-in stats:', failed.error);
        return null;
      }

      return {
        checkedInCount: checkinRes.count || 0,
        refrigerioCount: refrigerioRes.count || 0,
        totalRegistered: regsRes.count || 0,
      };
    } catch (err) {
      console.error('Error fetching check-in stats:', err);
      return null;
    }
  }

  async verifyRegistration(
    registrationId: string,
    eventId: string,
    mode: ScanMode,
    sessionId: string | null,
  ): Promise<ScanResult> {
    // 1. Validar que la credencial tenga formato UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(registrationId.trim())) {
      return {
        success: false,
        reason: 'invalid_code',
        message: 'Este código no es una credencial de inscripción.',
      };
    }

    // Se castea a any para permitir la inserción y actualización dinámica
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;

    // 2. Consultar la registración del asistente en la BD
    const { data: reg, error: regError } = await client
      .from('registrations')
      .select(
        `
        id,
        event_id,
        user_id,
        event_role,
        status,
        ticket_types ( name ),
        users (
          first_name,
          last_name,
          email,
          phone
        )
      `,
      )
      .eq('id', registrationId.trim())
      .maybeSingle();

    if (regError) {
      console.error('Error fetching registration:', regError);
      return {
        success: false,
        reason: 'error',
        message: 'No se pudo consultar la credencial. Revisa tu conexión y vuelve a intentarlo.',
      };
    }

    if (!reg) {
      return {
        success: false,
        reason: 'not_found',
        message: 'La credencial no corresponde a ninguna inscripción.',
      };
    }

    // Casteamos la consulta para poder leer los datos relacionados de forma segura
    const rawReg = reg as unknown as {
      id: string;
      event_id: string;
      user_id: string | null;
      event_role: string;
      status: string;
      ticket_types: { name: string } | null;
      users: { first_name: string; last_name: string; email: string; phone?: string | null } | null;
    };

    const attendee = {
      firstName: rawReg.users?.first_name || 'Participante',
      lastName: rawReg.users?.last_name || '',
      email: rawReg.users?.email || '',
      phone: rawReg.users?.phone || null,
      role: rawReg.event_role,
      ticketName: rawReg.ticket_types?.name || 'General Admission',
    };

    // 3. Validar que pertenezca al evento seleccionado
    if (rawReg.event_id !== eventId) {
      return {
        success: false,
        reason: 'other_event',
        message: 'Esta credencial pertenece a otro evento.',
        attendee,
      };
    }

    // 4. Validar que la registración esté confirmada (la BD además rechaza las anuladas)
    if (rawReg.status?.toUpperCase() !== 'CONFIRMED') {
      return {
        success: false,
        reason: blocksAttendance(rawReg.status) ? 'cancelled' : 'pending',
        message: blocksAttendance(rawReg.status)
          ? 'La inscripción está anulada. No puede registrar asistencia.'
          : 'La inscripción está pendiente de pago. Envíala a la mesa de pagos.',
        attendee,
      };
    }

    // 5. Determinar tipo de escaneo y etiqueta
    let scanType = '';
    let scanTypeLabel = '';

    if (mode === 'checkin') {
      scanType = 'checkin';
      scanTypeLabel = 'Registro General / Check-in';
    } else if (mode === 'refrigerio') {
      scanType = 'refrigerio';
      scanTypeLabel = 'Entrega de Refrigerio';
    } else if (mode === 'session') {
      if (!sessionId) {
        return {
          success: false,
          reason: 'session_required',
          message: 'Elige una sesión para registrar el ingreso.',
          attendee,
        };
      }
      scanType = `session_entry:${(sessionId || '').substring(0, 16)}`;
      scanTypeLabel = 'Ingreso a Sesión';
    }

    // 6. Verificar si ya fue escaneado anteriormente para este tipo de escaneo
    const { data: existingScan, error: scanCheckError } = await client
      .from('scan_logs')
      .select('id, scanned_at')
      .eq('registration_id', rawReg.id)
      .eq('scan_type', scanType)
      .maybeSingle();

    if (scanCheckError) {
      console.error('Error checking scan logs:', scanCheckError);
      return {
        success: false,
        reason: 'error',
        message: 'No se pudo comprobar si ya estaba registrado. Vuelve a intentarlo.',
        attendee,
      };
    }

    if (existingScan) {
      return {
        success: false,
        alreadyScanned: true,
        reason: 'already_scanned',
        message: 'Ya se registró antes.',
        scannedAt: existingScan.scanned_at ? new Date(existingScan.scanned_at) : new Date(),
        attendee,
        scanTypeLabel,
      };
    }

    // 7. Si es modo sesión, validar que esté registrado en la sesión
    if (mode === 'session' && sessionId) {
      const { data: sessionReg, error: sessionRegError } = await client
        .from('session_registrations')
        .select('*')
        .eq('registration_id', rawReg.id)
        .eq('session_id', sessionId)
        .maybeSingle();

      if (sessionRegError) {
        console.error('Error checking session registrations:', sessionRegError);
        return {
          success: false,
          reason: 'error',
          message: 'No se pudo validar la inscripción a la sesión. Vuelve a intentarlo.',
          attendee,
        };
      }

      if (!sessionReg) {
        return {
          success: false,
          reason: 'not_in_session',
          message: 'No está inscrito en esta sesión.',
          attendee,
          scanTypeLabel,
        };
      }
    }

    return {
      success: true,
      message: 'Credencial válida para escanear.',
      attendee,
      scanTypeLabel,
      registrationDbId: rawReg.id,
      userId: rawReg.user_id,
    };
  }

  async registerScan(
    registrationId: string,
    eventId: string,
    mode: ScanMode,
    sessionId: string | null,
    operatorUserId: string | null,
  ): Promise<ScanResult> {
    // 1. Verificar la registración
    const verification = await this.verifyRegistration(registrationId, eventId, mode, sessionId);

    // Si la verificación falló o ya fue escaneado, retornamos directamente ese resultado
    if (!verification.success || verification.alreadyScanned) {
      return verification;
    }

    // Se castea a any para permitir la inserción
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;

    // Determinar el tipo de escaneo
    let scanType = '';
    let scanTypeLabel = '';

    if (mode === 'checkin') {
      scanType = 'checkin';
      scanTypeLabel = 'Registro General / Check-in';
    } else if (mode === 'refrigerio') {
      scanType = 'refrigerio';
      scanTypeLabel = 'Entrega de Refrigerio';
    } else if (mode === 'session') {
      scanType = `session_entry:${(sessionId || '').substring(0, 16)}`;
      scanTypeLabel = 'Ingreso a Sesión';
    }

    // 2. Registrar el escaneo en `scan_logs`. El id se genera aquí para poder deshacerlo.
    // `scanned_at` lo pone el servidor (default now()): la ventana de Deshacer no depende del reloj del teléfono.
    const scanLogId = crypto.randomUUID();
    const { data: inserted, error: insertScanError } = await client
      .from('scan_logs')
      .insert({
        id: scanLogId,
        registration_id: verification.registrationDbId,
        scan_type: scanType,
        scanned_by: operatorUserId,
      })
      .select('scanned_at');
    const serverScannedAt = inserted?.[0]?.scanned_at
      ? new Date(inserted[0].scanned_at)
      : new Date();

    if (insertScanError) {
      console.error('Error saving scan log:', insertScanError);
      // 23505: otro operador lo registró un instante antes. P0001: la inscripción se anuló.
      const reason =
        insertScanError.code === '23505'
          ? 'already_scanned'
          : insertScanError.code === 'P0001'
            ? 'cancelled'
            : 'error';
      return {
        success: false,
        reason,
        alreadyScanned: reason === 'already_scanned',
        message: 'No se pudo guardar el registro. Vuelve a intentarlo.',
        attendee: verification.attendee,
        scanTypeLabel,
      };
    }

    // 3. Si es modo sesión y existe el usuario, actualizar `inscripciones_sessions` para mantener sincronía
    if (mode === 'session' && sessionId && verification.userId) {
      const { error: updateInscripcionError } = await client
        .from('inscripciones_sessions')
        .update({
          asistio: true,
          checked_in_at: serverScannedAt.toISOString(),
        })
        .eq('usuario_id', verification.userId)
        .eq('session_id', sessionId);

      if (updateInscripcionError) {
        console.error('Warning: could not sync inscripciones_sessions:', updateInscripcionError);
      }
    }

    return {
      success: true,
      message:
        mode === 'checkin'
          ? '¡Asistencia registrada con éxito!'
          : mode === 'refrigerio'
            ? '¡Refrigerio entregado con éxito!'
            : '¡Ingreso a sesión registrado con éxito!',
      attendee: verification.attendee,
      scannedAt: serverScannedAt,
      scanTypeLabel,
      scanLogId,
    };
  }

  async undoScan(input: UndoScanInput): Promise<UndoScanResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;

    let result: { data: { id: string }[] | null; error: PostgrestError | null };
    try {
      result = await client.from('scan_logs').delete().eq('id', input.scanLogId).select('id');
    } catch (err) {
      console.error('Error undoing scan:', err);
      return { ok: false, reason: 'error', message: UNDO_NETWORK_MESSAGE };
    }
    const { data, error } = result;

    if (error) {
      console.error('Error undoing scan:', error);
      return { ok: false, reason: 'error', message: UNDO_NETWORK_MESSAGE };
    }

    // RLS solo deja borrar tu propio registro de los últimos 60 s: sin filas = ya no se puede.
    if (!data || data.length === 0) {
      return { ok: false, reason: 'expired', message: UNDO_EXPIRED_MESSAGE };
    }

    if (input.mode === 'session' && input.sessionId && input.userId) {
      const { error: syncError } = await client
        .from('inscripciones_sessions')
        .update({ asistio: false, checked_in_at: null })
        .eq('usuario_id', input.userId)
        .eq('session_id', input.sessionId);

      if (syncError) {
        console.error('Warning: could not sync inscripciones_sessions:', syncError);
      }
    }

    return { ok: true, message: 'Registro deshecho.' };
  }

  async getAssignedEventIds(): Promise<string[]> {
    const { data, error } = await this.supabase.from('event_staff_assignments').select('event_id');

    if (error) {
      console.error('Error fetching staff assignments:', error);
      throw error;
    }

    return (data ?? []).map((row) => row.event_id);
  }
}
