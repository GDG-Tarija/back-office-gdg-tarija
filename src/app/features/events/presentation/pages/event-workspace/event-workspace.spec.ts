import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { EventInput } from '../../../domain/event.model';
import { EventsRepository } from '../../../domain/events.repository';
import { SessionsRepository } from '../../../domain/sessions.repository';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';
import { EventWorkspace } from './event-workspace';

describe('EventWorkspace: grupo de WhatsApp', () => {
  const event = { id: 'e1', title: 'DevFest' };
  const events = {
    getEventById: vi.fn(),
    getWhatsappGroupUrl: vi.fn(),
    saveWhatsappGroupUrl: vi.fn(),
    update: vi.fn(),
    countRegistrations: vi.fn(),
    countActiveRegistrations: vi.fn(),
  };
  let ws: EventWorkspace;

  beforeEach(() => {
    vi.resetAllMocks();
    events.getEventById.mockResolvedValue(event);
    events.getWhatsappGroupUrl.mockResolvedValue('https://chat.whatsapp.com/Abc123');
    events.update.mockResolvedValue(event);
    events.countRegistrations.mockResolvedValue(0);
    events.countActiveRegistrations.mockResolvedValue(0);
    TestBed.configureTestingModule({
      providers: [
        EventWorkspace,
        { provide: EventsRepository, useValue: events },
        { provide: TicketTypesRepository, useValue: { list: vi.fn().mockResolvedValue([]) } },
        { provide: SessionsRepository, useValue: { list: vi.fn().mockResolvedValue([]) } },
      ],
    });
    ws = TestBed.inject(EventWorkspace);
  });

  it('carga el link junto con el evento', async () => {
    await ws.load('e1');
    expect(ws.whatsappGroupUrl()).toBe('https://chat.whatsapp.com/Abc123');
  });

  it('"Datos" guarda el link, incluso para borrarlo', async () => {
    await ws.load('e1');
    await ws.saveBasics({ whatsappGroupUrl: null } as EventInput);
    expect(events.saveWhatsappGroupUrl).toHaveBeenCalledWith('e1', null);
    expect(ws.whatsappGroupUrl()).toBeNull();
  });

  it('un guardado sin el campo no toca el link', async () => {
    await ws.load('e1');
    await ws.saveBasics({} as EventInput);
    expect(events.saveWhatsappGroupUrl).not.toHaveBeenCalled();
    expect(ws.whatsappGroupUrl()).toBe('https://chat.whatsapp.com/Abc123');
  });
});
