import { AiProviderModel } from '../models/aiProviderModel';
import { PromptTemplateModel } from '../models/promptTemplateModel';
import { AiExecutor } from './aiExecutor';

export interface AiCallParams {
  providerId?: string;
  providerName?: string;
  systemTemplate?: string;       // template name
  userTemplate?: string;         // template name
  context: Record<string, any>;
  outputSchema?: Record<string, any>;
  temperature?: number;
  maxTokens?: number;
}

export async function aiCall(params: AiCallParams): Promise<any> {
  let providerId = params.providerId;
  if (!providerId && params.providerName) {
    const all = AiProviderModel.getAll();
    providerId = all.find(p => p.name === params.providerName)?.id;
  }
  const sysT = params.systemTemplate ? PromptTemplateModel.getByName(params.systemTemplate) : undefined;
  const usrT = params.userTemplate ? PromptTemplateModel.getByName(params.userTemplate) : undefined;
  const config: any = {
    aiProviderId: providerId,
    aiPromptTemplateSystemId: sysT?.id,
    aiPromptTemplateUserId: usrT?.id,
    aiOutputSchema: params.outputSchema,
    aiTemperature: params.temperature,
    aiMaxTokens: params.maxTokens,
  };
  const fn = params.outputSchema
    ? AiExecutor.executeStructuredOutput.bind(AiExecutor)
    : AiExecutor.executePrompt.bind(AiExecutor);
  const result = await fn(config, params.context);
  if (!result.success) throw new Error(result.error || 'ai.call failed');
  return result.output;
}
