import { registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { TestBed } from '@angular/core/testing';

import { Attendee } from '../../../domain/event.model';
import { PaymentProofDialog, ProofStatusChange } from './payment-proof-dialog';

const attendee: Attendee = {
  id: 'r1',
  userId: 'u1',
  email: 'a@b.c',
  firstName: 'Ana',
  lastName: 'Paz',
  avatarUrl: null,
  phone: null,
  role: 'ATTENDEE',
  status: 'PENDING',
  ticketName: 'Entrada de Pago',
  ticketPrice: 15,
  phaseName: 'Normal',
  phasePrice: 20,
  couponId: null,
  couponCode: null,
  amountDue: 20,
  registeredAt: null,
  customResponses: null,
  paymentProofUrl: 'https://x/p.png',
  checkedIn: false,
};

registerLocaleData(localeEsBo, 'es-BO');

describe('PaymentProofDialog', () => {
  function create(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(PaymentProofDialog);
    fixture.componentRef.setInput('attendee', attendee);
    fixture.componentRef.setInput('total', 3);
    fixture.componentRef.setInput('position', 2);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra la imagen con la entrada y el monto esperado', () => {
    const fixture = create({ canManage: true });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Ana Paz');
    expect(text).toContain('Normal');
    expect(text).toContain('Bs\u00A020');
    expect(document.body.querySelector('img[alt^="Comprobante"]')).toBeTruthy();
    fixture.destroy();
  });

  it('un PDF muestra enlace en vez de imagen', () => {
    const fixture = create({ attendee: { ...attendee, paymentProofUrl: 'https://x/p.pdf' } });
    expect(fixture.componentInstance.showImage()).toBe(false);
    expect(document.body.textContent).toContain('no es una imagen');
    fixture.destroy();
  });

  it('si la imagen falla cae al enlace de descarga', () => {
    const fixture = create();
    fixture.componentInstance.onImageError();
    fixture.detectChanges();
    expect(fixture.componentInstance.showImage()).toBe(false);
    expect(document.body.textContent).toContain('No se pudo cargar la imagen');
    fixture.destroy();
  });

  it('confirma solo tras la confirmación y solo para quien puede gestionar', () => {
    const fixture = create({ canManage: true });
    const cmp = fixture.componentInstance;
    const changes: ProofStatusChange[] = [];
    cmp.statusChange.subscribe((c) => changes.push(c));

    cmp.runAction();
    expect(changes).toEqual([]);

    cmp.startAction('CONFIRMED');
    cmp.runAction();
    expect(changes).toEqual([{ attendee, status: 'CONFIRMED' }]);
    fixture.destroy();
  });

  it('un STAFF no puede iniciar acciones', () => {
    const fixture = create({ canManage: false });
    const cmp = fixture.componentInstance;
    cmp.startAction('CANCELLED');
    expect(cmp.pendingAction()).toBeNull();
    expect(cmp.actions()).toEqual([]);
    fixture.destroy();
  });

  it('ofrece los otros dos estados: anular a la izquierda, confirmar el pago al final', () => {
    const pendingCmp = create({ canManage: true }).componentInstance;
    expect(pendingCmp.actions().map((o) => o.value)).toEqual(['CANCELLED', 'CONFIRMED']);
    TestBed.resetTestingModule();

    const confirmed = create({ canManage: true, attendee: { ...attendee, status: 'CONFIRMED' } });
    expect(confirmed.componentInstance.actions().map((o) => o.value)).toEqual([
      'CANCELLED',
      'PENDING',
    ]);
    confirmed.destroy();
  });

  it('un pago confirmado se puede desestimar (volver a pendiente) y una anulada restaurar', () => {
    const fixture = create({ canManage: true, attendee: { ...attendee, status: 'CANCELLED' } });
    const cmp = fixture.componentInstance;
    const changes: ProofStatusChange[] = [];
    cmp.statusChange.subscribe((c) => changes.push(c));

    cmp.startAction('CANCELLED');
    expect(cmp.pendingAction()).toBeNull();

    cmp.startAction('PENDING');
    cmp.runAction();
    expect(changes.map((c) => c.status)).toEqual(['PENDING']);
    fixture.destroy();
  });

  it('si el estado cambia, descarta la confirmación en curso', () => {
    const fixture = create({ canManage: true });
    const cmp = fixture.componentInstance;
    cmp.startAction('CANCELLED');
    fixture.componentRef.setInput('attendee', { ...attendee, status: 'CONFIRMED' });
    fixture.detectChanges();
    expect(cmp.pendingAction()).toBeNull();
    fixture.destroy();
  });

  it('navega con botones y flechas respetando los extremos', () => {
    const fixture = create({ position: 1 });
    const cmp = fixture.componentInstance;
    const steps: string[] = [];
    cmp.previous.subscribe(() => steps.push('prev'));
    cmp.next.subscribe(() => steps.push('next'));

    cmp.goPrevious();
    cmp.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(steps).toEqual(['next']);

    fixture.componentRef.setInput('position', 3);
    fixture.detectChanges();
    cmp.goNext();
    cmp.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(steps).toEqual(['next', 'prev']);
    fixture.destroy();
  });

  it('el zoom se limita a los pasos y se reinicia al cambiar de inscripción', () => {
    const fixture = create();
    const cmp = fixture.componentInstance;
    cmp.zoomOut();
    expect(cmp.zoomIndex()).toBe(0);
    cmp.zoomIn();
    cmp.zoomIn();
    expect(cmp.zoom()).toBe(2);
    fixture.componentRef.setInput('attendee', { ...attendee, id: 'r2' });
    fixture.detectChanges();
    expect(cmp.zoomIndex()).toBe(0);
    fixture.destroy();
  });

  it('cerrar con Esc/botón emite closed', () => {
    const fixture = create();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.componentInstance.onVisibleChange(false);
    expect(closed).toBe(1);
    fixture.destroy();
  });
});
