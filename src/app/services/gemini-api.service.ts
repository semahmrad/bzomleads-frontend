import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AskRequest, AskResponse } from '../models/ask.models';

@Injectable({ providedIn: 'root' })
export class GeminiApiService {
  private readonly http = inject(HttpClient);

  ask(prompt: string) {
    const payload: AskRequest = { prompt };
    return this.http.post<AskResponse>('/api/ask', payload);
  }
}
