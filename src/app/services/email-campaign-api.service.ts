import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  EmailCampaignSendRequest,
  EmailCampaignSendResponse,
} from '../models/email-campaign.models';

@Injectable({ providedIn: 'root' })
export class EmailCampaignApiService {
  private readonly http = inject(HttpClient);

  sendCampaign(payload: EmailCampaignSendRequest) {
    return this.http.post<EmailCampaignSendResponse>('/api/email-campaigns/send', payload);
  }
}
