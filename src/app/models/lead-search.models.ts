export interface LeadSearchRequest {
  provider: string;
  locationQuery: string;
  businessType: string;
  websiteFilter: string;
  extractEmailsFromSites: boolean;
  useGeminiForEmailExtraction: boolean;
  maxResults: number;
  countryCode?: string;
  searchSessionId?: string;
}

export interface LeadSearchResponse {
  provider: string;
  query: string;
  businessType: string;
  websiteFilter: string;
  extractEmailsFromSites: boolean;
  total: number;
  existingResultsCount: number;
  newResultsCount: number;
  requestedNewResults: number;
  withWebsiteCount: number;
  withoutWebsiteCount: number;
  emailCount: number;
  items: LeadSearchResultItem[];
}

export interface LeadSearchResultItem {
  placeId: string;
  name: string;
  businessLabel: string;
  primaryType?: string | null;
  formattedAddress?: string | null;
  phoneNumber?: string | null;
  websiteUri?: string | null;
  googleMapsUri?: string | null;
  businessStatus?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  hasWebsite: boolean;
  emailExtractionSource: string;
  emailAddresses: string[];
  contactPhoneNumbers: string[];
  contactPageUris: string[];
}

export interface WebsiteGenerationRequest {
  placeId: string;
  businessName: string;
  businessCategory: string;
  primaryType?: string | null;
  description?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  whatsappNumber?: string | null;
  websiteUri?: string | null;
  googleMapsUri?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  reviewsSummary?: string | null;
  emailAddresses?: string[];
  openingHours?: string[];
  services?: string[];
  features?: string[];
  photoUris?: string[];
  logoUri?: string | null;
  socialLinks?: Record<string, string>;
  languages?: string[];
}

export interface WebsiteProjectResponse {
  projectId: string;
  businessName: string;
  templateId: string;
  templateName: string;
  designConcept: string;
  modelUsed: string;
  downloadUrl: string;
  repositoryUrl: string;
  productionUrl: string;
  changeSummary?: string | null;
  prioritizedAssets: string[];
  updatedUtc: string;
  placeId?: string | null;
  createdByUserId?: string | null;
  createdByDisplayName?: string | null;
}

export interface WebsiteProjectEditRequest {
  prompt: string;
}

export interface LeadSearchResponseSummary {
  total: number;
  existingResultsCount: number;
  newResultsCount: number;
  requestedNewResults: number;
  withWebsiteCount: number;
  withoutWebsiteCount: number;
  emailCount: number;
}

export interface LeadStreamMessage {
  type: 'summary' | 'lead' | 'done' | 'error';
  summary?: LeadSearchResponseSummary | null;
  lead?: LeadSearchResultItem | null;
  errorMessage?: string | null;
  leads?: LeadSearchResultItem[] | null;
}
