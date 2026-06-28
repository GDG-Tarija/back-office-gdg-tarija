import { Event, Attendee } from '../domain/event.model';
import { EventRow, RegistrationWithDetailsRow } from './events.dto';

export function toDomainEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    eventType: row.event_type,
    capacity: row.capacity,
    dateStart: new Date(row.date_start),
    dateEnd: row.date_end ? new Date(row.date_end) : null,
    isPublished: !!row.is_published,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    description: row.description,
    imageUrl: row.image_url,
    bannerUrl: row.banner_url,
    locationType: row.location_type,
    locationName: row.location_name,
    addressLink: row.address_link,
    category: row.category,
    extraInfo: row.extra_info,
  };
}

export function toDomainAttendee(row: RegistrationWithDetailsRow): Attendee {
  const user = row.users;
  const ticket = row.ticket_types;
  const scanLogs = row.scan_logs;
  const checkinLog = scanLogs?.find((log) => log.scan_type === 'checkin');
  const refrigerioLog = scanLogs?.find((log) => log.scan_type === 'refrigerio');

  return {
    id: row.id,
    userId: row.user_id || user?.id || null,
    email: user?.email || '',
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    avatarUrl: user?.avatar_url || null,
    phone: user?.phone || null,
    role: row.event_role,
    status: row.status,
    ticketName: ticket?.name || 'General',
    ticketPrice: ticket?.price || 0,
    registeredAt: row.created_at ? new Date(row.created_at) : null,
    customResponses: row.custom_responses,
    paymentProofUrl: row.payment_proof_url || null,
    checkedIn: !!checkinLog,
    checkedInAt: checkinLog?.scanned_at ? new Date(checkinLog.scanned_at) : null,
    refrigerioDelivered: !!refrigerioLog,
    refrigerioDeliveredAt: refrigerioLog?.scanned_at ? new Date(refrigerioLog.scanned_at) : null,
  };
}
