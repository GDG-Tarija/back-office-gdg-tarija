import { Component, computed, input } from '@angular/core';

import { ValidationResult } from '../../../domain/event-validators';

@Component({
  selector: 'app-publish-checklist',
  standalone: true,
  templateUrl: './publish-checklist.html',
})
export class PublishChecklist {
  readonly result = input.required<ValidationResult>();
  readonly ready = computed(() => this.result().errors.length === 0);
}
