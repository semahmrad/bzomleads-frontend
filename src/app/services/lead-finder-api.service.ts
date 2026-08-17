import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  LeadSearchRequest,
  LeadSearchResponse,
  LeadStreamMessage,
  WebsiteGenerationRequest,
  WebsiteProjectEditRequest,
  WebsiteProjectResponse,
} from '../models/lead-search.models';

@Injectable({ providedIn: 'root' })
export class LeadFinderApiService {
  private readonly http = inject(HttpClient);

  searchLeads(payload: LeadSearchRequest) {
    return this.http.post<LeadSearchResponse>('/api/leads/search', payload);
  }

  searchLeadsStream(payload: LeadSearchRequest): Observable<LeadStreamMessage> {
    return new Observable<LeadStreamMessage>((subscriber) => {
      const abortController = new AbortController();

      fetch('/api/leads/search/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
        credentials: 'same-origin',
      })
        .then(async (response) => {
          if (!response.ok) {
            const rawError = await response.text();
            let message = rawError.trim();
            try {
              const parsed = JSON.parse(rawError) as { error?: unknown };
              if (typeof parsed.error === 'string' && parsed.error.trim()) {
                message = parsed.error.trim();
              }
            } catch {
              // Keep the plain response when the API did not return JSON.
            }

            subscriber.error(
              new Error(message || `La recherche a echoue avec le code HTTP ${response.status}.`),
            );
            return;
          }

          if (!response.body) {
            subscriber.error(new Error('Le serveur ne permet pas de suivre la recherche en direct.'));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const parsed = JSON.parse(line) as LeadStreamMessage;
                    subscriber.next(parsed);
                  } catch {
                    throw new Error('Le serveur a retourne une reponse de recherche illisible.');
                  }
                }
              }
            }

            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer) as LeadStreamMessage;
                subscriber.next(parsed);
              } catch {
                throw new Error('La derniere reponse de recherche est incomplete ou illisible.');
              }
            }

            subscriber.complete();
          } catch (error) {
            subscriber.error(error);
          }
        })
        .catch((err) => {
          subscriber.error(err);
        });

      return () => {
        abortController.abort();
      };
    });
  }

  cancelLeadSearch(searchSessionId: string): Promise<void> {
    return new Promise((resolve) => {
      this.http
        .post<{ cancelled: boolean }>(
          `/api/leads/search/${encodeURIComponent(searchSessionId)}/cancel`,
          {},
        )
        .subscribe({
          next: () => resolve(),
          error: () => resolve(),
        });
    });
  }

  listWebsiteProjects() {
    return this.http.get<WebsiteProjectResponse[]>('/api/websites/projects');
  }

  generateWebsite(
    payload: WebsiteGenerationRequest,
    options?: {
      uploadedImages?: File[];
      uploadedLogo?: File | null;
    },
  ) {
    const formData = new FormData();
    formData.append('requestJson', JSON.stringify(payload));

    for (const image of options?.uploadedImages ?? []) {
      formData.append('uploadedImages', image, image.name);
    }

    const logo = options?.uploadedLogo;
    if (logo) {
      formData.append('uploadedLogo', logo, logo.name);
    }

    return this.http.post<WebsiteProjectResponse>('/api/websites/generate', formData);
  }

  editWebsite(
    projectId: string,
    payload: WebsiteProjectEditRequest,
    options?: {
      uploadedImages?: File[];
      uploadedLogo?: File | null;
    },
  ) {
    const hasUploads = !!options?.uploadedLogo || !!options?.uploadedImages?.length;
    if (!hasUploads) {
      return this.http.post<WebsiteProjectResponse>(
        `/api/websites/projects/${encodeURIComponent(projectId)}/edit`,
        payload,
      );
    }

    const formData = new FormData();
    formData.append('requestJson', JSON.stringify(payload));

    for (const image of options?.uploadedImages ?? []) {
      formData.append('uploadedImages', image, image.name);
    }

    const logo = options?.uploadedLogo;
    if (logo) {
      formData.append('uploadedLogo', logo, logo.name);
    }

    return this.http.post<WebsiteProjectResponse>(
      `/api/websites/projects/${encodeURIComponent(projectId)}/edit`,
      formData,
    );
  }
}
