import { Component, ElementRef, computed, input, output, viewChildren } from '@angular/core';

import { EVENT_TABS, EventTabId, TabStatus } from '../../../domain/event-tabs';

/**
 * Navegación entre las secciones del evento. En modo asistente (`setup`) se ve como pasos
 * numerados con su estado; en gestión normal, como pestañas ARIA con flechas, Home y End.
 */
@Component({
  selector: 'app-event-section-nav',
  standalone: true,
  templateUrl: './event-section-nav.html',
})
export class EventSectionNav {
  readonly current = input.required<EventTabId>();
  readonly statuses = input.required<Record<EventTabId, TabStatus>>();
  readonly setup = input(false);
  /** Secciones con algo pendiente que el usuario ya dejó atrás (se marcan "con error"). */
  readonly flagged = input<readonly EventTabId[]>([]);

  readonly sectionChange = output<EventTabId>();

  readonly tabs = EVENT_TABS;
  readonly currentIndex = computed(() => this.tabs.findIndex((t) => t.id === this.current()));
  readonly currentLabel = computed(() => this.tabs[this.currentIndex()].label);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  isFlagged(id: EventTabId): boolean {
    return this.flagged().includes(id);
  }

  statusLabel(id: EventTabId): string {
    if (this.isFlagged(id)) return 'con datos pendientes';
    switch (this.statuses()[id]) {
      case 'complete':
        return 'completo';
      case 'optional':
        return 'opcional';
      default:
        return 'pendiente';
    }
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    const last = this.tabs.length - 1;
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % this.tabs.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + this.tabs.length) % this.tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    this.buttons()[target]?.nativeElement.focus();
  }
}
