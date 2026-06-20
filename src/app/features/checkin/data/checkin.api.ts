import { Injectable, inject } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { SUPABASE } from '../../../core/supabase/supabase.client';
import { CheckinRepository } from '../domain/checkin.repository';
import { Session, ScanResult, ScanMode } from '../domain/checkin.model';
import { Event } from '../../events/domain/event.model';
import { toDomainEvent } from '../../events/data/events.mapper';
import { EventRow } from '../../events/data/events.dto';

@Injectable({
  providedIn: 'root',
})
export class CheckinApi implements CheckinRepository {
  private readonly supabase = inject(SUPABASE);

  async getEvents(): Promise<Event[]> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .order('date_start', { ascending: false });

    if (error) {
      console.error('Error fetching events in checkin:', error);
      throw error;
    }

    return (data || []).map((row) => toDomainEvent(row as unknown as EventRow));
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
      const timeStr = row.start_time ? ` (${row.start_time.substring(0, 5)})` : '';
      const speakerStr = row.speaker ? ` - por ${row.speaker}` : '';
      const displayLabel = `${row.title}${speakerStr}${timeStr}`;

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
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.supabase as any;

    try {
      const [regsRes, logsRes] = await Promise.all([
        client
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('status', 'CONFIRMED'),
        client
          .from('scan_logs')
          .select('id, scan_type, registrations!inner(event_id)')
          .eq('registrations.event_id', eventId),
      ]);

      let checkedInCount = 0;
      let refrigerioCount = 0;

      if (logsRes.data) {
        logsRes.data.forEach((log: { scan_type: string }) => {
          if (log.scan_type === 'checkin') {
            checkedInCount++;
          } else if (log.scan_type === 'refrigerio') {
            refrigerioCount++;
          }
        });
      }

      return {
        checkedInCount,
        refrigerioCount,
        totalRegistered: regsRes.count || 0,
      };
    } catch (err) {
      console.error('Error fetching check-in stats:', err);
      return {
        checkedInCount: 0,
        refrigerioCount: 0,
        totalRegistered: 0,
      };
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
        message: 'Código QR no válido. Formato de credencial incorrecto.',
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
          email
        )
      `,
      )
      .eq('id', registrationId.trim())
      .maybeSingle();

    if (regError) {
      console.error('Error fetching registration:', regError);
      return {
        success: false,
        message: 'Error al consultar la base de datos para la credencial.',
      };
    }

    if (!reg) {
      return {
        success: false,
        message: 'La credencial no corresponde a ningún registro en el sistema.',
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
      users: { first_name: string; last_name: string; email: string } | null;
    };

    const attendee = {
      firstName: rawReg.users?.first_name || 'Participante',
      lastName: rawReg.users?.last_name || '',
      email: rawReg.users?.email || '',
      role: rawReg.event_role,
      ticketName: rawReg.ticket_types?.name || 'General Admission',
    };

    // 3. Validar que pertenezca al evento seleccionado
    if (rawReg.event_id !== eventId) {
      return {
        success: false,
        message: 'Esta credencial pertenece a otro evento.',
        attendee,
      };
    }

    // 4. Validar que la registración esté confirmada
    if (rawReg.status?.toUpperCase() !== 'CONFIRMED') {
      return {
        success: false,
        message: `El registro del asistente está en estado: ${rawReg.status}. Debe estar Confirmado.`,
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
          message: 'Debe seleccionar una sesión para registrar el ingreso.',
          attendee,
        };
      }
      scanType = `sess:${sessionId.substring(0, 25)}`;
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
        message: 'Error al verificar registros previos de asistencia.',
        attendee,
      };
    }

    if (existingScan) {
      return {
        success: false,
        alreadyScanned: true,
        message: `Ya se registró la asistencia previamente.`,
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
          message: 'Error al validar registro en la sesión.',
          attendee,
        };
      }

      if (!sessionReg) {
        return {
          success: false,
          message: 'El asistente no se encuentra registrado para participar en esta sesión.',
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
      scanType = `sess:${(sessionId || '').substring(0, 25)}`;
      scanTypeLabel = 'Ingreso a Sesión';
    }

    // 2. Registrar el escaneo en `scan_logs`
    const { error: insertScanError } = await client.from('scan_logs').insert({
      registration_id: verification.registrationDbId,
      scan_type: scanType,
      scanned_by: operatorUserId,
      scanned_at: new Date().toISOString(),
    });

    if (insertScanError) {
      console.error('Error saving scan log:', insertScanError);
      return {
        success: false,
        message: 'No se pudo guardar el registro de asistencia en la base de datos.',
        attendee: verification.attendee,
      };
    }

    // 3. Si es modo sesión y existe el usuario, actualizar `inscripciones_sessions` para mantener sincronía
    if (mode === 'session' && sessionId && verification.userId) {
      const { error: updateInscripcionError } = await client
        .from('inscripciones_sessions')
        .update({
          asistio: true,
          checked_in_at: new Date().toISOString(),
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
      scannedAt: new Date(),
      scanTypeLabel,
    };
  }
}
