export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
  supportsVision: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiProviderInput {
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
  supportsVision?: boolean;
  isDefault?: boolean;
}

export type UpdateAiProviderInput = Partial<CreateAiProviderInput>;
