import { TestBed } from '@angular/core/testing';

import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';

import { FeedbackService } from './feedback.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let messages: { add: ReturnType<typeof vi.fn> };
  let confirmed: Confirmation | undefined;

  beforeEach(() => {
    confirmed = undefined;
    messages = { add: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MessageService, useValue: messages },
        {
          provide: ConfirmationService,
          useValue: { confirm: (c: Confirmation) => (confirmed = c) },
        },
      ],
    });
    service = TestBed.inject(FeedbackService);
  });

  it('success y error publican toasts con la severidad correcta', () => {
    service.success('Guardado');
    service.error('No se pudo guardar');
    expect(messages.add).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ severity: 'success', summary: 'Guardado' }),
    );
    expect(messages.add).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ severity: 'error', summary: 'No se pudo guardar' }),
    );
  });

  it('confirm resuelve true al aceptar', async () => {
    const result = service.confirm({ titulo: 'Anular', mensaje: '¿Seguro?', aceptar: 'Anular' });
    expect(confirmed?.header).toBe('Anular');
    expect(confirmed?.acceptLabel).toBe('Anular');
    confirmed?.accept?.();
    expect(await result).toBe(true);
  });

  it('confirm resuelve false al rechazar o cerrar', async () => {
    const result = service.confirm({ titulo: 'Anular', mensaje: '¿Seguro?', aceptar: 'Anular' });
    confirmed?.reject?.();
    expect(await result).toBe(false);
  });

  it('peligro usa botón destructivo y enfoca Cancelar', () => {
    void service.confirm({ titulo: 'a', mensaje: 'b', aceptar: 'c', peligro: true });
    expect(confirmed?.acceptButtonProps?.severity).toBe('danger');
    expect(confirmed?.defaultFocus).toBe('reject');
  });
});
