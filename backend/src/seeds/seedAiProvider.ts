import { AiProviderModel } from '../models/aiProviderModel';
import { createLogger } from '../utils/logger';

const log = createLogger('seedAiProvider');

export function seedAiProvider(): void {
  const existing = AiProviderModel.getDefault();
  if (existing) {
    log.info(`Default AI provider already exists: ${existing.name}`);
    return;
  }
  const baseUrl = process.env.VLLM_BASE_URL;
  const model = process.env.VLLM_DEFAULT_MODEL;
  if (!baseUrl || !model) {
    log.warn('VLLM_BASE_URL or VLLM_DEFAULT_MODEL not set; skipping default provider seed');
    return;
  }
  AiProviderModel.create({
    name: 'default-vllm',
    baseUrl,
    model,
    apiKey: process.env.VLLM_API_KEY || undefined,
    supportsVision: process.env.VLLM_SUPPORTS_VISION === 'true',
    isDefault: true,
  });
  log.info(`Seeded default AI provider: ${baseUrl} (${model})`);
}
