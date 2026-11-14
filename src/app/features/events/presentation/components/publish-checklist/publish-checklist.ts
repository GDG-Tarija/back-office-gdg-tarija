import { Component, computed, input, output } from '@angular/core';

import { EVENT_TABS, tabForField } from '../../../domain/event-tabs';
import { ValidationIssue, ValidationResult } from '../../../domain/event-validators';

@Component({
  selector: 'app-publish-checklist',
  standalone: true,
  templateUrl: './publish-checklist.html',
})
export class PublishChecklist {
  readonly result = input.required<ValidationResult>();
  /** Se pidió publicar con pendientes: el encabezado pasa a ser un aviso. */
  readonly attempted = input(false);
  readonly ready = computed(() => this.result().errors.length === 0);

  /** El usuario pidió ir al lugar donde se corrige este pendiente. */
  readonly go = output<ValidationIssue>();

  tabLabel(issue: ValidationIssue): string {
    const id = tabForField(issue.field);
    return EVENT_TABS.find((t) => t.id === id)?.label ?? 'Datos';
  }
}
