import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { TestBed } from '@angular/core/testing';

import { StoreOrder } from '../../../domain/store.model';
import { StoreOrdersRepository } from '../../../domain/store.repository';
import { StoreOrderDialog, StoreOrderStatusRequest } from './store-order-dialog';

registerLocaleData(localeEsBo, 'es-BO');

function order(o: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id: 'o1',
    eventId: 'e1',
    registrationId: 'r1',
    userId: 'u1',
    buyer: { firstName: 'Ana', lastName: 'Asistente', email: 'ana@ejemplo.test', phone: null },
    registrationStatus: 'CONFIRMED',
    status: 'PENDING',
    total: 220,
    paymentProofPath: 'u1/e1/comprobante.png',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    items: [
      {
        id: 'i1',
        productId: 'p1',
        productName: 'Kit DevFest',
        unitPrice: 80,
        quantity: 2,
        subtotal: 160,
        deliveredQuantity: 0,
      },
    ],
    ...o,
  };
}

describe('StoreOrderDialog', () => {
  const repo = { list: vi.fn(), getHistory: vi.fn(), setStatus: vi.fn(), getProofUrl: vi.fn() };

  beforeEach(() => {
    Object.values(repo).forEach((m) => m.mockReset());
    repo.getProofUrl.mockResolvedValue('https://x.test/firmada.png?token=1');
    repo.getHistory.mockResolvedValue([
      {
        id: 1,
        fromStatus: null,
        toStatus: 'PENDING',
        reason: null,
        isCorrection: false,
        changedBy: 'u1',
        changedByName: null,
        changedAt: new Date('2026-11-10T10:00:00Z'),
      },
    ]);
    TestBed.configureTestingModule({
      imports: [StoreOrderDialog],
      providers: [{ provide: StoreOrdersRepository, useValue: repo }],
    });
  });

  async function create(o: StoreOrder, canManage = true) {
    const fixture = TestBed.createComponent(StoreOrderDialog);
    fixture.componentRef.setInput('order', o);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.componentRef.setInput('position', 1);
    fixture.componentRef.setInput('total', 2);
    const emitted: StoreOrderStatusRequest[] = [];
    fixture.componentInstance.changeStatus.subscribe((r) => emitted.push(r));
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.proofState()).not.toBe('loading'));
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, emitted };
  }

  it('carga el comprobante privado con URL firmada y el historial', async () => {
    const { cmp } = await create(order());
    expect(repo.getProofUrl).toHaveBeenCalledWith('u1/e1/comprobante.png');
    expect(cmp.proofUrl()).toBe('https://x.test/firmada.png?token=1');
    expect(cmp.proofState()).toBe('ready');
    await vi.waitFor(() => expect(cmp.history()).toHaveLength(1));
  });

  it('si la URL firmada falla muestra el error y permite reintentar', async () => {
    repo.getProofUrl.mockRejectedValueOnce(new Error('x'));
    const { cmp } = await create(order());
    expect(cmp.proofState()).toBe('error');
    expect(cmp.proofError()).toContain('comprobante');
    await cmp.loadProof();
    expect(cmp.proofState()).toBe('ready');
  });

  it('un PDF no se previsualiza', async () => {
    const { cmp } = await create(order({ paymentProofPath: 'u1/e1/pago.pdf' }));
    expect(cmp.isPdf()).toBe(true);
  });

  it('abrir en pestaña pide una URL firmada nueva y avisa si falla', async () => {
    const { cmp } = await create(order({ paymentProofPath: 'u1/e1/pago.pdf' }));
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    repo.getProofUrl.mockResolvedValueOnce('https://x.test/firmada.pdf?token=2');
    await cmp.openProofInTab();
    expect(repo.getProofUrl).toHaveBeenCalledTimes(2);
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe('https://x.test/firmada.pdf?token=2');
    repo.getProofUrl.mockRejectedValueOnce(new Error('x'));
    await cmp.openProofInTab();
    expect(tab.close).toHaveBeenCalled();
    expect(cmp.openError()).toContain('comprobante');
    open.mockRestore();
  });

  it('marcar pagada pide confirmación y emite el estado sin motivo', async () => {
    const { cmp, emitted } = await create(order());
    cmp.startAction('paid');
    expect(cmp.action()).toBe('paid');
    expect(emitted).toHaveLength(0);
    cmp.submitAction();
    expect(emitted).toEqual([{ order: order(), status: 'PAID', reason: null }]);
  });

  it('volver de la confirmación no emite nada', async () => {
    const { cmp, emitted } = await create(order());
    cmp.startAction('cancel');
    cmp.resetAction();
    expect(cmp.action()).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it('anular acepta un motivo opcional', async () => {
    const { cmp, emitted } = await create(order());
    cmp.startAction('cancel');
    cmp.submitAction();
    cmp.startAction('cancel');
    cmp.onReasonInput('  Comprobante ilegible  ');
    cmp.submitAction();
    expect(emitted.map((e) => [e.status, e.reason])).toEqual([
      ['CANCELLED', null],
      ['CANCELLED', 'Comprobante ilegible'],
    ]);
  });

  it('no permite marcar pagada si la inscripción está anulada', async () => {
    const { cmp, emitted } = await create(order({ registrationStatus: 'CANCELLED' }));
    expect(cmp.paidBlockReason()).toContain('anulada');
    cmp.startAction('paid');
    expect(cmp.action()).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it('la corrección exige un motivo de 10 a 500 caracteres', async () => {
    const { cmp, emitted } = await create(order({ status: 'PAID' }));
    cmp.startAction('correct');
    cmp.submitAction();
    expect(cmp.showReasonError()).toBe(true);
    expect(cmp.reasonError()).toContain('Indica');
    cmp.onReasonInput('corto');
    cmp.submitAction();
    expect(emitted).toHaveLength(0);
    cmp.onReasonInput('Se validó el comprobante de otra persona');
    cmp.submitAction();
    expect(emitted).toEqual([
      {
        order: order({ status: 'PAID' }),
        status: 'PENDING',
        reason: 'Se validó el comprobante de otra persona',
      },
    ]);
  });

  it('no permite corregir una compra con productos entregados', async () => {
    const delivered = order({ status: 'PAID' });
    delivered.items[0].deliveredQuantity = 1;
    const { cmp, fixture } = await create(delivered);
    expect(cmp.correctionBlock()).toContain('entregaron');
    cmp.startAction('correct');
    expect(cmp.action()).toBeNull();
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).ownerDocument.querySelectorAll<HTMLButtonElement>(
        'button',
      ),
    ).find((b) => b.textContent?.includes('Corregir estado'));
    expect(button?.disabled).toBe(true);
  });

  it('sin permiso no ofrece acciones', async () => {
    const { cmp, emitted } = await create(order(), false);
    cmp.startAction('paid');
    cmp.submitAction();
    expect(cmp.action()).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it('flechas navegan entre compras salvo dentro de un campo de texto', async () => {
    const { cmp } = await create(order());
    const next = vi.fn();
    cmp.next.subscribe(next);
    cmp.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(next).toHaveBeenCalledTimes(1);
    const textarea = document.createElement('textarea');
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    Object.defineProperty(ev, 'target', { value: textarea });
    cmp.onKeydown(ev);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('al cambiar el estado se reinicia la acción y se recarga el historial', async () => {
    const { cmp, fixture } = await create(order());
    cmp.startAction('paid');
    const calls = repo.getHistory.mock.calls.length;
    fixture.componentRef.setInput('order', order({ status: 'PAID' }));
    fixture.detectChanges();
    expect(cmp.action()).toBeNull();
    await vi.waitFor(() => expect(repo.getHistory.mock.calls.length).toBe(calls + 1));
    // Misma compra: no se vuelve a pedir la URL firmada.
    expect(repo.getProofUrl).toHaveBeenCalledTimes(1);
  });
});
