import { Component, computed, input } from '@angular/core';

import { ErrorSummaryItem, summaryHeading } from '../../utils/error-summary';
import { focusField } from '../../utils/focus';

/** Resumen de errores sobre el formulario: nombra los campos y enlaza a cada uno. */
@Component({
  selector: 'app-error-summary',
  standalone: true,
  templateUrl: './error-summary.html',
})
export class ErrorSummary {
  readonly items = input.required<ErrorSummaryItem[]>();
  readonly heading = computed(() => summaryHeading(this.items()));

  goTo(event: Event, id: string): void {
    event.preventDefault();
    focusField(id);
  }
}
