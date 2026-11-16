import { feedbackStub } from '../../../../../testing/feedback-stub';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BackofficeUser } from '../../../../users/domain/backoffice-user.model';
import { UsersRepository } from '../../../../users/domain/users.repository';
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

const user = (email: string, overrides: Partial<BackofficeUser> = {}): BackofficeUser => ({
  email,
  role: 'STAFF',
  userId: null,
  firstName: null,
  lastName: null,
  avatarUrl: null,
  lastSignInAt: null,
  addedAt: null,
  addedByEmail: null,
  lastActivityAt: null,
  assignedEvents: [],
  ...overrides,
});

describe('StaffAssignmentEditor', () => {
  const feedbackProvider = feedbackStub();
  const feedback = feedbackProvider.useValue;
  const repo = { list: vi.fn(), add: vi.fn(), remove: vi.fn() };
  const usersRepo = { list: vi.fn(), add: vi.fn(), setRole: vi.fn(), remove: vi.fn() };

  beforeEach(() => {
    [...Object.values(repo), ...Object.values(usersRepo)].forEach((m) => m.mockReset());
    repo.list.mockResolvedValue([a1]);
    usersRepo.list.mockResolvedValue([
      user('ana@gdg.com', { firstName: 'Ana', lastName: 'Paz' }),
      user('luis@gdg.com', { firstName: 'Luis', lastName: 'Rojas' }),
      user('admin@gdg.com', { role: 'SUPERADMIN' }),
    ]);
    TestBed.configureTestingModule({
      imports: [StaffAssignmentEditor],
      providers: [
        feedbackProvider,
        provideRouter([]),
        { provide: StaffAssignmentsRepository, useValue: repo },
      ],
    }).overrideComponent(StaffAssignmentEditor, {
      set: { providers: [{ provide: UsersRepository, useValue: usersRepo }] },
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

  it('lista a los asignados con su nombre y explica de dónde salen las opciones', async () => {
    const fixture = await create();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Ana Paz');
    expect(text).toContain('ana@gdg.com');
    expect(text).toContain('Solo aparecen quienes tienen acceso como Staff de check-in');
  });

  it('solo ofrece Staff de check-in que todavía no está asignado (sin superadmins)', async () => {
    const cmp = (await create()).componentInstance;
    expect(cmp.options().map((o) => o.value)).toEqual(['luis@gdg.com']);
  });

  it('estado vacío y error de carga', async () => {
    repo.list.mockResolvedValue([]);
    let fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Sin staff asignado');
    repo.list.mockRejectedValue(new Error('fallo'));
    fixture = await create();
    expect(fixture.componentInstance.loadError()).toBe('No se pudo cargar el staff del evento.');
  });

  it('no envía nada si no se eligió a nadie', async () => {
    const cmp = (await create()).componentInstance;
    await cmp.add();
    expect(repo.add).not.toHaveBeenCalled();
  });

  it('asigna a la persona elegida y limpia la selección', async () => {
    const cmp = (await create()).componentInstance;
    repo.add.mockResolvedValue({ ...a1, id: 's2', staffEmail: 'luis@gdg.com' });
    cmp.selectedEmail.set('luis@gdg.com');
    await cmp.add();
    expect(repo.add).toHaveBeenCalledWith('e1', 'luis@gdg.com');
    expect(cmp.assignments()).toHaveLength(2);
    expect(cmp.selectedEmail()).toBeNull();
    expect(cmp.options()).toEqual([]);
    expect(feedback.success).toHaveBeenCalledWith(expect.stringContaining('Luis Rojas'));
  });

  it('muestra el error del servidor al asignar', async () => {
    const cmp = (await create()).componentInstance;
    repo.add.mockRejectedValue(new DomainError('Sin permiso.', 'FORBIDDEN'));
    cmp.selectedEmail.set('luis@gdg.com');
    await cmp.add();
    expect(cmp.actionError()).toBe('Sin permiso.');
    expect(cmp.assignments()).toHaveLength(1);
  });

  it('no quita al staff si se cancela la confirmación', async () => {
    feedback.confirm.mockResolvedValueOnce(false);
    const cmp = (await create()).componentInstance;
    await cmp.remove(a1);
    expect(repo.remove).not.toHaveBeenCalled();
    expect(cmp.assignments()).toHaveLength(1);
  });

  it('quita una asignación', async () => {
    const cmp = (await create()).componentInstance;
    repo.remove.mockResolvedValue(undefined);
    await cmp.remove(a1);
    expect(repo.remove).toHaveBeenCalledWith('s1');
    expect(cmp.assignments()).toEqual([]);
  });
});
