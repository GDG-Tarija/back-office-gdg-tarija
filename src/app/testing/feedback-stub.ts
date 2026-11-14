import { vi } from 'vitest';

import { FeedbackService } from '../core/services/feedback.service';

/** FeedbackService falso para specs de componentes: la confirmación acepta por defecto. */
export function feedbackStub(confirmResult = true) {
  return {
    provide: FeedbackService,
    useValue: {
      success: vi.fn(),
      error: vi.fn(),
      confirm: vi.fn().mockResolvedValue(confirmResult),
    },
  };
}
