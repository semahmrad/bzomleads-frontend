export interface EmailCampaignRecipient {
  leadId: string;
  businessName: string;
  emailAddress: string;
  websiteUri?: string | null;
}

export interface EmailCampaignSmtpSettings {
  host: string;
  port: number;
  secureMode: string;
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail: string;
}

export interface EmailCampaignSendRequest {
  smtp: EmailCampaignSmtpSettings;
  subject: string;
  htmlBody: string;
  recipients: EmailCampaignRecipient[];
}

export interface EmailCampaignSendFailure {
  emailAddress: string;
  businessName?: string | null;
  errorMessage: string;
}

export interface EmailCampaignSendResponse {
  requestedCount: number;
  sentCount: number;
  failedCount: number;
  failures: EmailCampaignSendFailure[];
}
