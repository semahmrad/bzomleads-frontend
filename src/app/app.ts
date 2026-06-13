import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { marked } from 'marked';
import { firstValueFrom } from 'rxjs';
import { GeminiApiService } from './services/gemini-api.service';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  private readonly formBuilder = inject(FormBuilder);
  private readonly geminiApi = inject(GeminiApiService);

  protected readonly form = this.formBuilder.nonNullable.group({
    prompt: ['', [Validators.required]]
  });

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly response = signal('');
  protected readonly responseHtml = signal('');

  protected async submit(): Promise<void> {
    const prompt = this.form.controls.prompt.value.trim();

    this.error.set('');
    this.response.set('');
    this.responseHtml.set('');

    if (!prompt) {
      this.error.set('No prompt provided');
      this.form.controls.prompt.markAsTouched();
      return;
    }

    try {
      this.loading.set(true);

      const data = await firstValueFrom(this.geminiApi.ask(prompt));
      const answer = data.response ?? '';

      this.response.set(answer);
      this.responseHtml.set(await marked.parse(answer, { async: false, breaks: true, gfm: true }));
    } catch (error) {
      this.error.set(this.resolveErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected clear(): void {
    this.form.reset({ prompt: '' });
    this.loading.set(false);
    this.error.set('');
    this.response.set('');
    this.responseHtml.set('');
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'string' && error.error.trim()) {
        return error.error;
      }

      if (error.error && typeof error.error.error === 'string' && error.error.error.trim()) {
        return error.error.error;
      }

      return error.message || 'Request failed';
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'Unknown error';
  }
}
