import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputTextModule } from 'primeng/inputtext';

import { BackofficeRole } from '../../../../../core/models/role.model';
import { DialogFrame } from '../../../../../shared/components/dialog-frame/dialog-frame';
import { toUserMessage } from '../../../../events/data/postgres-error.mapper';
import { DomainError } from '../../../../events/domain/domain-error';
import { ROLE_OPTIONS, normalizeEmail, validateNewUserEmail } from '../../../domain/user-rules';
import { UsersRepository } from '../../../domain/users.repository';

@Component({
  selector: 'app-add-user-dialog',
  standalone: true,
  imports: [FormsModule, InputTextModule, DialogFrame],
  templateUrl: './add-user-dialog.html',
})
export class AddUserDialog {
  private readonly repo = inject(UsersRepository);

  /** Correos que ya tienen acceso, para avisar antes de enviar. */
  readonly existingEmails = input.required<readonly string[]>();

  readonly closed = output<void>();
  readonly added = output<string>();

  readonly roleOptions = ROLE_OPTIONS;
  readonly email = signal('');
  readonly role = signal<BackofficeRole>('STAFF');
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly emailError = computed(() => {
    if (this.serverError()) return this.serverError();
    if (!this.submitted()) return null;
    return validateNewUserEmail(this.email(), this.existingEmails());
  });
  readonly dirty = computed(() => this.email().trim() !== '' || this.role() !== 'STAFF');

  setEmail(value: string): void {
    this.email.set(value);
    this.serverError.set(null);
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.saving()) return;
    if (validateNewUserEmail(this.email(), this.existingEmails())) {
      document.getElementById('new-user-email')?.focus();
      return;
    }
    const email = normalizeEmail(this.email());
    this.saving.set(true);
    try {
      await this.repo.add(email, this.role());
      this.added.emit(email);
    } catch (err) {
      this.serverError.set(
        err instanceof DomainError && err.field === 'email'
          ? err.message
          : toUserMessage(err, 'No se pudo dar acceso. Inténtalo de nuevo.', 'staff'),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
