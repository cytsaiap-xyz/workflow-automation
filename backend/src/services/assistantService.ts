import OpenAI from 'openai';
import { AssistantConversationModel } from '../models/assistantConversationModel';
import { AiProviderModel } from '../models/aiProviderModel';
import { estimateTokens } from './tokenEstimator';

const CONTEXT_WINDOW = Number(process.env.ASSISTANT_CONTEXT_WINDOW || 8192);
const COMPACT_THRESHOLD = 0.75;
const KEEP_RECENT = 8;

export function getAssistantProvider() {
  const id = process.env.ASSISTANT_PROVIDER_ID;
  if (id) {
    const p = AiProviderModel.getById(id);
    if (p) return p;
  }
  return AiProviderModel.getDefault();
}

export async function maybeCompact(conversationId: string, systemPrompt: string): Promise<boolean> {
  const conv = AssistantConversationModel.getById(conversationId);
  if (!conv) throw new Error('conversation not found');
  const allText = systemPrompt
    + (conv.summary || '')
    + conv.messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const estimate = estimateTokens(allText);
  if (estimate < CONTEXT_WINDOW * COMPACT_THRESHOLD) return false;

  const half = Math.floor(conv.messages.length / 2);
  const oldest = conv.messages.slice(0, half);
  const compactInput = oldest.map(m => `${m.role}: ${m.content}`).join('\n\n');

  const provider = getAssistantProvider();
  if (!provider) throw new Error('no AI provider configured');
  const client = new OpenAI({ baseURL: provider.baseUrl, apiKey: provider.apiKey || 'not-needed' });
  const completion = await client.chat.completions.create({
    model: provider.model,
    messages: [
      { role: 'system', content: 'You compact a conversation into 200-300 token notes preserving user goals, decisions, files referenced, and last-known workflow state.' },
      { role: 'user', content: compactInput },
    ],
    temperature: 0.2,
    max_tokens: 400,
  });
  const summary = completion.choices[0]?.message?.content?.trim() || '';

  const keep = Math.max(KEEP_RECENT, conv.messages.length - half);
  AssistantConversationModel.compact(conversationId, summary, keep);
  return true;
}
