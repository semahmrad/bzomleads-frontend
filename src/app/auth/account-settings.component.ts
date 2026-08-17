import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from './auth.service';
import { AiSettingsComponent } from './ai-settings.component';

@Component({
  selector: 'app-account-settings',
  imports: [ReactiveFormsModule, AiSettingsComponent],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsComponent {
  readonly closed = output<void>();

  protected readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  protected readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
    confirmation: ['', [Validators.required]],
  });

  protected async savePassword(): Promise<void> {
    this.error.set('');
    this.success.set('');
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.error.set('Complete correctement les trois champs du mot de passe.');
      return;
    }

    const values = this.passwordForm.getRawValue();
    if (values.newPassword !== values.confirmation) {
      this.error.set('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    try {
      this.loading.set(true);
      await this.auth.changePassword(values.currentPassword, values.newPassword);
      this.passwordForm.reset();
      this.success.set('Ton mot de passe a ete modifie. La session actuelle reste active.');
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected close(): void {
    if (!this.loading()) {
      this.closed.emit();
    }
  }
}
