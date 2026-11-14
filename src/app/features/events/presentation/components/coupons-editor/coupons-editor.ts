import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
// Signal Forms es experimental en Angular 21.2; ver nota en event-basics-form.
import { FormField, form } from '@angular/forms/signals';

import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

import { FeedbackService } from '../../../../../core/services/feedback.service';
import { ErrorSummary } from '../../../../../shared/components/error-summary/error-summary';
import { ErrorSummaryItem, buildErrorSummary } from '../../../../../shared/utils/error-summary';
import { focusField } from '../../../../../shared/utils/focus';
import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { errorField, toUserMessage } from '../../../data/postgres-error.mapper';
import { Coupon, COUPON_ROLES } from '../../../domain/coupon.model';
import {
  COUPON_ROLE_LABELS,
  CouponFormValue,
  couponDeleteBlockReason,
  couponRemaining,
  couponToFormValue,
  emptyCouponFormValue,
  formValueToCouponInput,
  generateCouponCode,
} from '../../../domain/coupon-form';
import { CouponsRepository } from '../../../domain/coupons.repository';
import {
  ValidationIssue,
  normalizeCouponCode,
  validateCoupon,
} from '../../../domain/event-validators';

@Component({
  selector: 'app-coupons-editor',
  standalone: true,
  imports: [FormField, InputTextModule, TooltipModule, DialogFrame, ErrorSummary],
  templateUrl: './coupons-editor.html',
})
export class CouponsEditor implements OnInit {
  private readonly repo = inject(CouponsRepository);
  private readonly feedback = inject(FeedbackService);

  readonly eventId = input.required<string>();

  /** Lista actualizada tras cargar o cambiar cupones. */
  readonly couponsChange = output<Coupon[]>();

  readonly roles = COUPON_ROLES;
  readonly roleLabels = COUPON_ROLE_LABELS;

  readonly coupons = signal<Coupon[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly editing = signal<Coupon | null>(null);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly dialogError = signal<string | null>(null);
  readonly model = signal<CouponFormValue>(emptyCouponFormValue());
  readonly f = form(this.model);
  private readonly baseline = signal('');
  readonly dirty = computed(() => JSON.stringify(this.model()) !== this.baseline());

  readonly toDelete = signal<Coupon | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  readonly validation = computed(() => {
    const editing = this.editing();
    return validateCoupon(formValueToCouponInput(this.model()), {
      otherCodes: this.coupons()
        .filter((c) => c.id !== editing?.id)
        .map((c) => c.code),
      usedCount: editing?.usedCount,
    });
  });

  private readonly serverIssue = signal<ValidationIssue | null>(null);
  readonly errors = computed(() => {
    const server = this.serverIssue();
    return server ? [...this.validation().errors, server] : this.validation().errors;
  });
  readonly canSave = computed(() => this.errors().length === 0 && !this.saving());
  readonly summary = computed<ErrorSummaryItem[]>(() =>
    this.submitted()
      ? buildErrorSummary(this.errors(), {
          code: { id: 'cp-code', label: 'Código' },
          role: { id: 'cp-role', label: 'Rol' },
          maxUses: { id: 'cp-uses', label: 'Usos máximos' },
        })
      : [],
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.repo.list(this.eventId());
      this.coupons.set(list);
      this.couponsChange.emit(list);
    } catch (err) {
      this.loadError.set(toUserMessage(err, 'No se pudieron cargar los cupones.', 'coupon'));
    } finally {
      this.loading.set(false);
    }
  }

  remaining(c: Coupon): number {
    return couponRemaining(c);
  }

  deleteBlockReason(c: Coupon): string | null {
    return couponDeleteBlockReason(c.usedCount);
  }

  fieldError(field: string): string | null {
    if (!this.submitted()) return null;
    return this.errors().find((e) => e.field === field)?.message ?? null;
  }

  openCreate(): void {
    this.openDialog(null, emptyCouponFormValue());
  }

  openEdit(c: Coupon): void {
    this.openDialog(c, couponToFormValue(c));
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  generateCode(): void {
    this.model.update((v) => ({ ...v, code: generateCouponCode() }));
  }

  normalizeCode(): void {
    this.model.update((v) => ({ ...v, code: normalizeCouponCode(v.code) }));
  }

  async copy(c: Coupon): Promise<void> {
    try {
      this.actionError.set(null);
      await navigator.clipboard.writeText(c.code);
      this.feedback.success(`Código ${c.code} copiado al portapapeles.`);
    } catch {
      this.actionError.set('No se pudo copiar. Selecciona el código y cópialo manualmente.');
    }
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.serverIssue.set(null);
    if (!this.canSave()) {
      const first = this.summary()[0];
      if (first) focusField(first.id);
      return;
    }
    const input = formValueToCouponInput(this.model());
    this.saving.set(true);
    this.dialogError.set(null);
    try {
      const editing = this.editing();
      const saved = editing
        ? await this.repo.update(editing.id, input)
        : await this.repo.create(this.eventId(), input);
      this.coupons.update((list) =>
        editing ? list.map((c) => (c.id === saved.id ? saved : c)) : [...list, saved],
      );
      this.couponsChange.emit(this.coupons());
      this.dialogOpen.set(false);
      this.feedback.success(editing ? 'Cupón actualizado.' : 'Cupón creado.');
    } catch (err) {
      const message = toUserMessage(err, 'No se pudo guardar el cupón.', 'coupon');
      const field = errorField(err);
      if (field) this.serverIssue.set({ field, message });
      else this.dialogError.set(message);
    } finally {
      this.saving.set(false);
    }
  }

  askDelete(c: Coupon): void {
    if (this.deleteBlockReason(c)) return;
    this.deleteError.set(null);
    this.toDelete.set(c);
  }

  cancelDelete(): void {
    this.toDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const c = this.toDelete();
    if (!c || this.deleteBlockReason(c)) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.repo.delete(c.id);
      this.coupons.update((list) => list.filter((x) => x.id !== c.id));
      this.couponsChange.emit(this.coupons());
      this.toDelete.set(null);
      this.feedback.success('Cupón eliminado.');
    } catch (err) {
      this.deleteError.set(toUserMessage(err, 'No se pudo eliminar el cupón.', 'coupon'));
    } finally {
      this.deleting.set(false);
    }
  }

  private openDialog(coupon: Coupon | null, value: CouponFormValue): void {
    this.editing.set(coupon);
    this.model.set(value);
    this.baseline.set(JSON.stringify(value));
    this.submitted.set(false);
    this.serverIssue.set(null);
    this.dialogError.set(null);
    this.dialogOpen.set(true);
  }
}
