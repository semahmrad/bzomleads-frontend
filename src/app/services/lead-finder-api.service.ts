import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  LeadSearchRequest,
  LeadSearchResponse,
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
