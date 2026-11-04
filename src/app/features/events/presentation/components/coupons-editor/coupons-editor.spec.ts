import { TestBed } from '@angular/core/testing';

import { Coupon } from '../../../domain/coupon.model';
import { CouponsRepository } from '../../../domain/coupons.repository';
import { DomainError } from '../../../domain/domain-error';
import { CouponsEditor } from './coupons-editor';

const used: Coupon = {
  id: 'c1',
  eventId: 'e1',
  code: 'SPEAKER1',
  role: 'SPEAKER',
  maxUses: 5,
  usedCount: 2,
};
const unused: Coupon = {
  id: 'c2',
  eventId: 'e1',
  code: 'FREE',
  role: 'ATTENDEE',
  maxUses: 3,
  usedCount: 0,
};

describe('CouponsEditor', () => {
  const repo = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };

  beforeEach(() => {
    Object.values(repo).forEach((m) => m.mockReset());
    repo.list.mockResolvedValue([used, unused]);
    TestBed.configureTestingModule({
      imports: [CouponsEditor],
      providers: [{ provide: CouponsRepository, useValue: repo }],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(CouponsEditor);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
    return fixture;
  }

  it('lista cupones con usos restantes y aviso de sensibilidad', async () => {
    const fixture = await create();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('SPEAKER1');
    expect(text).toContain('3 restante(s)');
    expect(text).toContain('sensibles');
  });

  it('muestra estado vacío y error de carga con reintento', async () => {
    repo.list.mockResolvedValue([]);
    let fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Aún no hay cupones');
    repo.list.mockRejectedValue(new Error('boom'));
    fixture = await create();
    expect(fixture.componentInstance.loadError()).toBe('boom');
  });

  it('bloquea eliminar un cupón con usos y permite el no usado', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.askDelete(used);
    expect(cmp.toDelete()).toBeNull();
    const buttons = fixture.nativeElement.querySelectorAll('button[aria-label^="Eliminar cupón"]');
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
    repo.delete.mockResolvedValue(undefined);
    cmp.askDelete(unused);
    await cmp.confirmDelete();
    expect(repo.delete).toHaveBeenCalledWith('c2');
    expect(cmp.coupons()).toEqual([used]);
  });

  it('normaliza a mayúsculas al crear', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.model.set({ code: ' nuevo1 ', role: 'STAFF', maxUses: '2' });
    repo.create.mockResolvedValue({
      ...unused,
      id: 'c3',
      code: 'NUEVO1',
      role: 'STAFF',
      maxUses: 2,
    });
    await cmp.save();
    expect(repo.create).toHaveBeenCalledWith('e1', { code: 'NUEVO1', role: 'STAFF', maxUses: 2 });
    expect(cmp.dialogOpen()).toBe(false);
    expect(cmp.coupons()).toHaveLength(3);
  });

  it('rechaza duplicado local, usos menores a los usados y no llama al servidor', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.model.set({ code: 'free', role: 'STAFF', maxUses: '1' });
    await cmp.save();
    expect(cmp.fieldError('code')).toContain('Ya existe');
    cmp.openEdit(used);
    cmp.model.update((v) => ({ ...v, maxUses: '1' }));
    await cmp.save();
    expect(cmp.fieldError('maxUses')).toContain('2');
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('muestra el DomainError de duplicado del servidor', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.model.set({ code: 'otro', role: 'STAFF', maxUses: '1' });
    repo.create.mockRejectedValue(
      new DomainError('Ya existe un cupón con ese código en el evento.', 'DUPLICATE', 'code'),
    );
    await cmp.save();
    expect(cmp.dialogError()).toContain('Ya existe');
    expect(cmp.dialogOpen()).toBe(true);
  });

  it('genera un código y copia al portapapeles', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.openCreate();
    cmp.generateCode();
    expect(cmp.model().code).toMatch(/^[A-Z2-9]{8}$/);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await cmp.copy(used);
    expect(writeText).toHaveBeenCalledWith('SPEAKER1');
    expect(cmp.notice()).toContain('copiado');
    vi.unstubAllGlobals();
  });
});
