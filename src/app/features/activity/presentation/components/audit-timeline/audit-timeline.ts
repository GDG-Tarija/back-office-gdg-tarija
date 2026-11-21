import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuditEntry } from '../../../domain/audit-entry.model';
import {
  ActorKind,
  AuditTone,
  actorKind,
  actorLabel,
  changeLines,
  describeAudit,
} from '../../../domain/describe-audit';

const TONE_CLASSES: Record<AuditTone, string> = {
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-error-bg text-error-text',
  info: 'bg-info-bg text-info-text',
  neutral: 'bg-neutral-100 text-text-secondary dark:bg-neutral-800 dark:text-neutral-300',
};

const KIND_BADGES: Record<ActorKind, string | null> = {
  backoffice: null,
  web: 'Desde la web',
  system: 'Fuera de la app',
};

/** Lista de "quién hizo qué": Actividad, historial de una inscripción y Resumen del evento. */
@Component({
  selector: 'app-audit-timeline',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './audit-timeline.html',
})
export class AuditTimeline {
  readonly entries = input.required<readonly AuditEntry[]>();
  /** En el historial de un evento o una inscripción, el evento ya se sabe. */
  readonly showEvent = input(true);

  readonly rows = computed(() =>
    this.entries().map((entry) => {
      const description = describeAudit(entry);
      const kind = actorKind(entry);
      return {
        entry,
        icon: description.icon,
        toneClass: TONE_CLASSES[description.tone],
        actor: actorLabel(entry),
        // "Ada Admin confirmó el pago…": la frase sigue al nombre de quien actuó.
        text: description.text.charAt(0).toLowerCase() + description.text.slice(1),
        badge: entry.source === 'backfill' ? 'Importado' : KIND_BADGES[kind],
        lines: changeLines(entry),
      };
    }),
  );
}
