import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from './auth.service';
import { AiSettingsComponent } from './ai-settings.component';

@Component({
  selector: 'app-auth-panel',
  imports: [ReactiveFormsModule, AiSettingsComponent],
  templateUrl: './auth-panel.component.html',
  styleUrl: './auth-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPanelComponent {
  protected readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected readonly loginForm = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  protected readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(10)]],
    confirmation: ['', [Validators.required]],
  });

  protected async submitLogin(): Promise<void> {
    this.error.set('');
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const values = this.loginForm.getRawValue();
    try {
      this.loading.set(true);
      await this.auth.login(values.username.trim(), values.password);
      this.loginForm.controls.password.setValue('');
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async submitPasswordChange(): Promise<void> {
    this.error.set('');
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
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
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
