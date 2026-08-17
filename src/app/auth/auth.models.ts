export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: 'Admin' | 'User';
  countryCode: string;
  countryName: string;
  allowedCountries: CountryOption[];
  mustChangePassword: boolean;
  aiConfigured: boolean;
};

export type CountryOption = {
  code: string;
  name: string;
};

export type AdminUser = AuthUser & {
  isActive: boolean;
  createdUtc: string;
  lastLoginUtc: string | null;
  lastActivityUtc: string | null;
  searchCount: number;
  newLeadsCount: number;
  emailCampaignCount: number;
  emailsSentCount: number;
  websitesCreatedCount: number;
  websitesEditedCount: number;
};

export type CreateUserRequest = {
  username: string;
  displayName: string;
  password: string;
  countryCodes: string[];
};

export type UpdateUserRequest = {
  username?: string;
  displayName?: string;
  countryCodes?: string[];
  isActive?: boolean;
};

export type AdminWebsiteProject = {
  projectId: string;
  placeId: string;
  businessName: string;
  templateId: string;
  templateName: string;
  designConcept: string;
  modelUsed: string;
  status: 'Published' | 'RepositoryReady' | 'Generated';
  downloadUrl: string | null;
  repositoryUrl: string | null;
  productionUrl: string | null;
  changeSummary: string | null;
  uploadedImageCount: number;
  hasCustomLogo: boolean;
  hasBeenEdited: boolean;
  createdUtc: string;
  updatedUtc: string;
  createdByUserId: string | null;
  createdByUsername: string | null;
  createdByDisplayName: string | null;
  commercialCountryCode: string | null;
  commercialCountryName: string | null;
  commercialIsActive: boolean | null;
  clientLinkSent: boolean;
  clientLinkSentUtc: string | null;
  clientName: string | null;
  clientContact: string | null;
  clientDeliveryNotes: string | null;
  commercialCountries: CountryOption[];
};

export type UpdateClientDeliveryRequest = {
  clientLinkSent: boolean;
  clientName: string;
  clientContact: string;
  notes: string;
};

export type AiModelOption = {
  id: string;
  name: string;
  description: string;
};

export type AiSettings = {
  configured: boolean;
  maskedApiKey: string | null;
  model: string;
  availableModels: AiModelOption[];
};

export type UpdateAiSettingsRequest = {
  apiKey: string | null;
  model: string;
};
