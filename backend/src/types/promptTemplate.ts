export interface PromptTemplate {
  id: string;
  name: string;
  role: 'system' | 'user';
  content: string;
  description?: string;
  requiresVision: boolean;
  tags: string[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptTemplateInput {
  name: string;
  role: 'system' | 'user';
  content: string;
  description?: string;
  requiresVision?: boolean;
  tags?: string[];
  builtin?: boolean;
}

export type UpdatePromptTemplateInput = Partial<CreatePromptTemplateInput>;
