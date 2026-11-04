import { TestBed } from '@angular/core/testing';

import { DomainError } from '../../../domain/domain-error';
import { StaffAssignment } from '../../../domain/staff-assignment.model';
import { StaffAssignmentsRepository } from '../../../domain/staff-assignments.repository';
import { StaffAssignmentEditor } from './staff-assignment-editor';

const a1: StaffAssignment = {
  id: 's1',
  eventId: 'e1',
  staffEmail: 'ana@gdg.com',
  assignedAt: new Date(),
};

describe('StaffAssignmentEditor', () => {
  const repo = { list: vi.fn(), add: vi.fn(), remove: vi.fn() };

  beforeEach(() => {
    Object.values(repo).forEach((m) => m.mockReset());
    repo.list.mockResolvedValue([a1]);
    TestBed.configureTestingModule({
      imports: [StaffAssignmentEditor],
      providers: [{ provide: StaffAssignmentsRepository, useValue: repo }],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(StaffAssignmentEditor);
    fixture.componentRef.setInput('eventId', 'e1');
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
    return fixture;
  }

  it('lista asignados y muestra el aviso de autorización', async () => {
    const fixture = await create();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('ana@gdg.com');
    expect(text).toContain('autorizado como STAFF');
  });

  it('estado vacío y error de carga', async () => {
    repo.list.mockResolvedValue([]);
    let fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Sin staff asignado');
    repo.list.mockRejectedValue(new Error('fallo'));
    fixture = await create();
    expect(fixture.componentInstance.loadError()).toBe('fallo');
  });

  it('rechaza correo inválido y duplicado (sin distinguir mayúsculas)', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    cmp.model.set({ email: 'no-es-correo' });
    await cmp.add();
    expect(cmp.emailError()).toContain('válido');
    cmp.model.set({ email: ' ANA@GDG.COM ' });
    await cmp.add();
    expect(cmp.emailError()).toContain('ya está asignado');
    expect(repo.add).not.toHaveBeenCalled();
  });

  it('agrega normalizado a minúsculas y limpia el campo', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    repo.add.mockResolvedValue({ ...a1, id: 's2', staffEmail: 'luis@gdg.com' });
    cmp.model.set({ email: '  Luis@GDG.com ' });
    await cmp.add();
    expect(repo.add).toHaveBeenCalledWith('e1', 'luis@gdg.com');
    expect(cmp.assignments()).toHaveLength(2);
    expect(cmp.model().email).toBe('');
    expect(cmp.notice()).toContain('luis@gdg.com');
  });

  it('muestra el error del servidor al agregar', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    repo.add.mockRejectedValue(new DomainError('Sin permiso.', 'FORBIDDEN'));
    cmp.model.set({ email: 'x@y.com' });
    await cmp.add();
    expect(cmp.actionError()).toBe('Sin permiso.');
    expect(cmp.assignments()).toHaveLength(1);
  });

  it('quita una asignación', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance;
    repo.remove.mockResolvedValue(undefined);
    await cmp.remove(a1);
    expect(repo.remove).toHaveBeenCalledWith('s1');
    expect(cmp.assignments()).toEqual([]);
  });
});
