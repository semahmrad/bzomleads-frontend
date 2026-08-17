import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthUser, AiSettings } from './auth.models';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-ai-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiSettingsComponent implements OnInit {
  readonly onboarding = input(false);
  readonly configured = output<AuthUser>();

  private readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly settings = signal<AiSettings | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly showApiKey = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  protected readonly aiForm = this.formBuilder.nonNullable.group({
    apiKey: ['', [Validators.maxLength(256)]],
    model: ['gemma-3-27b-it', [Validators.required]],
  });

  ngOnInit(): void {
    void this.loadSettings();
  }

  protected toggleKeyVisibility(): void {
    this.showApiKey.update((visible) => !visible);
  }

  protected async save(): Promise<void> {
    const currentSettings = this.settings();
    const values = this.aiForm.getRawValue();
    this.error.set('');
    this.success.set('');

    if (this.aiForm.invalid || (!currentSettings?.configured && values.apiKey.trim().length < 20)) {
      this.aiForm.markAllAsTouched();
      this.error.set('Ajoute une cle Google AI Studio valide et choisis un modele.');
      return;
    }

    try {
      this.saving.set(true);
      const user = await this.auth.saveAiSettings({
        apiKey: values.apiKey.trim() || null,
        model: values.model,
      });
      this.aiForm.controls.apiKey.setValue('');
      await this.loadSettings(false);
      this.success.set('Configuration verifiee et enregistree. Ta cle reste chiffree sur le serveur.');
      this.configured.emit(user);
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async loadSettings(showLoader = true): Promise<void> {
    try {
      if (showLoader) {
        this.loading.set(true);
      }
      const settings = await this.auth.getAiSettings();
      this.settings.set(settings);
      this.aiForm.patchValue({ model: settings.model, apiKey: '' });
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      if (showLoader) {
        this.loading.set(false);
      }
    }
  }
}
