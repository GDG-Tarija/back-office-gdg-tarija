import { TestBed } from '@angular/core/testing';

import { DomainError } from '../../../domain/domain-error';
import { AssetsRepository } from '../../../domain/assets.repository';
import { TicketType } from '../../../domain/ticket-type.model';
import { TicketTypesRepository } from '../../../domain/ticket-types.repository';
import { TicketTypesEditor } from './ticket-types-editor';

const base: TicketType = {
  id: 't1',
  eventId: 'e1',
  name: 'General',
  description: null,
  price: 25,
  ticketCapacity: 10,
  imageUrl: null,
  paymentQrUrl: 'qr-old',
  phases: [],
};

describe('TicketTypesEditor', () => {
  const repo = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getRegistrationCounts: vi.fn(),
    getPhaseAvailability: vi.fn(),
  };
  const remove = vi.fn();

  beforeEach(() => {
    Object.values(repo).forEach((m) => m.mockReset());
    remove.mockReset().mockResolvedValue(undefined);
    repo.list.mockResolvedValue([base]);
    repo.getRegistrationCounts.mockResolvedValue({ t1: 5 });
    repo.getPhaseAvailability.mockResolvedValue({});
    TestBed.configureTestingModule({
      imports: [TicketTypesEditor],
      providers: [
        { provide: TicketTypesRepository, useValue: repo },
        { provide: AssetsRepository, useValue: { upload: vi.fn(), remove } },
      ],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(TicketTypesEditor);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.componentRef.setInput('eventCapacity', 8);
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
    return fixture;
  }

  it('carga paquetes e inscritos, emite la lista y advierte por cupos', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    const emitted: TicketType[][] = [];
    cmp.ticketsChange.subscribe((v) => emitted.push(v));
    await cmp.load();
    expect(cmp.registered(base)).toBe(5);
    expect(emitted[0]).toEqual([base]);
    expect(cmp.capacityWarnings()).toHaveLength(1);
  });

  it('deshabilita el borrado con inscritos', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    expect(cmp.deleteBlockReason(base)).toContain('5');
    cmp.askDelete(base);
    expect(cmp.toDelete()).toBeNull();
    const del = fixture.nativeElement.querySelector('button[aria-label^="Eliminar paquete"]');
    expect(del.disabled).toBe(true);
  });

  it('muestra el DomainError si el servidor rechaza el borrado (RESTRICT)', async () => {
    repo.getRegistrationCounts.mockResolvedValue({});
    const fixture = await create();
    const cmp = fixture.componentInstance;
    repo.delete.mockRejectedValue(
      new DomainError('No se puede eliminar un paquete con inscritos.', 'HAS_REGISTRATIONS'),
    );
    cmp.askDelete(base);
    await cmp.confirmDelete();
    expect(cmp.deleteError()).toBe('No se puede eliminar un paquete con inscritos.');
    expect(cmp.tickets()).toHaveLength(1);
  });

  it('bloquea guardar con cupo menor a los inscritos', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openEdit(base);
    cmp.model.update((v) => ({ ...v, ticketCapacity: '3' }));
    await cmp.save();
    expect(repo.update).not.toHaveBeenCalled();
    expect(cmp.fieldError('ticketCapacity')).toContain('5');
  });

  it('avisa al cambiar el precio con inscritos y guarda', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openEdit(base);
    cmp.model.update((v) => ({ ...v, price: '30' }));
    expect(cmp.fieldWarning('price')).toBeTruthy();
    repo.update.mockResolvedValue({ ...base, price: 30 });
    await cmp.save();
    expect(repo.update).toHaveBeenCalledWith('t1', expect.objectContaining({ price: 30 }));
    expect(cmp.dialogOpen()).toBe(false);
  });

  it('precio 0 limpia el QR y lo borra solo tras guardar', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openEdit(base);
    cmp.model.update((v) => ({ ...v, price: '0' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(cmp.model().paymentQrUrl).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    repo.update.mockResolvedValue({ ...base, price: 0, paymentQrUrl: null });
    await cmp.save();
    expect(remove).toHaveBeenCalledWith('qr-old');
  });

  it('cancelar el diálogo borra lo subido sin guardar', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.onImageUploaded('new-img');
    await cmp.closeDialog();
    expect(remove).toHaveBeenCalledWith('new-img');
  });

  describe('fases', () => {
    const phased: TicketType = {
      ...base,
      phases: [
        {
          id: 'p1',
          ticketTypeId: 't1',
          name: 'Preventa',
          position: 1,
          price: 25,
          capacity: 10,
          paymentQrUrl: 'qr-old',
        },
        {
          id: 'p2',
          ticketTypeId: 't1',
          name: 'Normal',
          position: 2,
          price: 40,
          capacity: null,
          paymentQrUrl: 'qr2',
        },
      ],
    };

    beforeEach(() => {
      repo.list.mockResolvedValue([phased]);
      repo.getPhaseAvailability.mockResolvedValue({
        p1: { ticketPhaseId: 'p1', sold: 4, remaining: 6, isActive: true },
        p2: { ticketPhaseId: 'p2', sold: 0, remaining: null, isActive: false },
      });
    });

    it('carga la disponibilidad y resume las fases en la tarjeta', async () => {
      const fixture = await create();
      const cmp = fixture.componentInstance;
      expect(cmp.phaseSummary(phased)).toEqual([
        { name: 'Preventa', label: '4/10', active: true },
        { name: 'Normal', label: '0 vendidos', active: false },
      ]);
      expect(fixture.nativeElement.textContent).toContain('Preventa · 4/10');
    });

    it('activar fases en un paquete sin fases crea Preventa + Entrada normal', async () => {
      repo.list.mockResolvedValue([base]);
      const fixture = await create();
      const cmp = fixture.componentInstance;
      cmp.openEdit(base);
      cmp.toggleUsesPhases(true);
      const phases = cmp.model().phases;
      expect(phases.map((p) => p.name)).toEqual(['Preventa', 'Entrada normal']);
      expect(phases[0]).toMatchObject({ price: '25', paymentQrUrl: 'qr-old' });
    });

    it('bloquea quitar una fase con ventas y deshabilita volver a "sin fases"', async () => {
      const fixture = await create();
      const cmp = fixture.componentInstance;
      cmp.openEdit(phased);
      cmp.removePhase(0);
      expect(cmp.model().phases).toHaveLength(2);
      expect(cmp.disablePhasesBlockReason()).toContain('Preventa');
      cmp.toggleUsesPhases(false);
      expect(cmp.model().usesPhases).toBe(true);
      cmp.removePhase(1);
      expect(cmp.model().phases.map((p) => p.id)).toEqual(['p1']);
    });

    it('no baja el cupo de una fase por debajo de lo vendido', async () => {
      const fixture = await create();
      const cmp = fixture.componentInstance;
      cmp.openEdit(phased);
      cmp.updatePhase(0, { capacity: '3' });
      await cmp.save();
      expect(repo.update).not.toHaveBeenCalled();
      expect(cmp.phaseError(0, 'capacity')).toContain('4');
    });

    it('guarda con las fases en orden y reordena', async () => {
      const fixture = await create();
      const cmp = fixture.componentInstance;
      cmp.openEdit(phased);
      cmp.updatePhase(0, { capacity: '12' });
      repo.update.mockResolvedValue(phased);
      await cmp.save();
      expect(repo.update).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({
          phases: [
            expect.objectContaining({ id: 'p1', capacity: 12 }),
            expect.objectContaining({ id: 'p2', capacity: null }),
          ],
        }),
      );
      cmp.openEdit(phased);
      cmp.shiftPhase(1, -1);
      expect(cmp.model().phases.map((p) => p.id)).toEqual(['p2', 'p1']);
    });

    it('pasar una fase a gratis descarta su QR', async () => {
      const fixture = await create();
      const cmp = fixture.componentInstance;
      cmp.openEdit(phased);
      cmp.updatePhase(0, { price: '0' });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(cmp.model().phases[0].paymentQrUrl).toBeNull();
    });
  });
});
