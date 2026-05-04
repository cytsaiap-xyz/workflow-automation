import OpenAI from 'openai';
import { AssistantConversationModel } from '../models/assistantConversationModel';
import { AiProviderModel } from '../models/aiProviderModel';
import { AppSettingsModel } from '../models/appSettingsModel';
import { estimateTokens } from './tokenEstimator';
import { ASSISTANT_TOOL_SCHEMAS, dispatchTool } from './assistantTools';
import { buildAssistantSystemPrompt } from './assistantPromptBuilder';
import { AssistantMessage } from '../types/assistant';

const CONTEXT_WINDOW = Number(process.env.ASSISTANT_CONTEXT_WINDOW || 8192);
const COMPACT_THRESHOLD = 0.75;
const KEEP_RECENT = 8;

export function getAssistantProvider() {
  const id = AppSettingsModel.get('assistant_provider_id') || process.env.ASSISTANT_PROVIDER_ID;
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

const MAX_TOOL_ITERATIONS = Number(process.env.ASSISTANT_MAX_TOOL_ITERATIONS || 8);
const TOOL_RESULT_MAX_CHARS = Number(process.env.ASSISTANT_TOOL_RESULT_MAX_CHARS || 7000);

export interface RunTurnOptions {
  conversationId: string;
  userMessage: string;
  onEvent?: (e: { type: string; [key: string]: any }) => void;
}

function truncate(s: string): string {
  if (s.length <= TOOL_RESULT_MAX_CHARS) return s;
  return s.slice(0, TOOL_RESULT_MAX_CHARS) + '\n...[truncated]';
}

export async function runTurn(opts: RunTurnOptions): Promise<void> {
  const { conversationId, userMessage, onEvent = () => {} } = opts;
  const conv = AssistantConversationModel.getById(conversationId);
  if (!conv) throw new Error('conversation not found');

  const sysPrompt = buildAssistantSystemPrompt({ surface: conv.surface, nodeId: conv.nodeId });

  // Append user message immediately.
  const userMsg: AssistantMessage = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
  AssistantConversationModel.appendMessage(conversationId, userMsg);

  // Compaction check.
  await maybeCompact(conversationId, sysPrompt);

  const provider = getAssistantProvider();
  if (!provider) throw new Error('no AI provider configured');
  const client = new OpenAI({ baseURL: provider.baseUrl, apiKey: provider.apiKey || 'not-needed' });

  // Build the OpenAI message array from the conversation state (post-compaction).
  const refreshed = AssistantConversationModel.getById(conversationId)!;
  const messages: any[] = [{ role: 'system', content: sysPrompt }];
  if (refreshed.summary) messages.push({ role: 'system', content: `Conversation summary so far:\n${refreshed.summary}` });
  for (const m of refreshed.messages) {
    if (m.role === 'tool') {
      messages.push({ role: 'tool', content: m.content, tool_call_id: m.toolCallId });
    } else if (m.toolCalls && m.toolCalls.length > 0) {
      messages.push({
        role: 'assistant', content: m.content || '',
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await client.chat.completions.create({
      model: provider.model,
      messages,
      tools: ASSISTANT_TOOL_SCHEMAS as any,
      temperature: 0.3,
      max_tokens: 1500,
    });
    const choice = completion.choices[0];
    const aMsg = choice.message;

    if (!aMsg.tool_calls || aMsg.tool_calls.length === 0) {
      const finalContent = aMsg.content || '';
      onEvent({ type: 'token', value: finalContent });
      const aRecord: AssistantMessage = {
        role: 'assistant', content: finalContent,
        timestamp: new Date().toISOString(),
      };
      AssistantConversationModel.appendMessage(conversationId, aRecord);
      onEvent({ type: 'done' });
      return;
    }

    const toolCallObjs = aMsg.tool_calls.map((tc: any) => ({
      id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}'),
    }));
    AssistantConversationModel.appendMessage(conversationId, {
      role: 'assistant', content: aMsg.content || '',
      toolCalls: toolCallObjs, timestamp: new Date().toISOString(),
    });
    messages.push(aMsg);

    for (const tc of aMsg.tool_calls) {
      if (tc.type !== 'function') continue;
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments || '{}');
      onEvent({ type: 'tool_call', name, args });
      let resultStr: string;
      try {
        const result = await dispatchTool(name, args, {
          conversationId, workflowId: conv.workflowId,
        });
        resultStr = truncate(JSON.stringify(result));
        if (name === 'propose_workflow_change') {
          onEvent({ type: 'pending_change', change_id: result.change_id });
        }
      } catch (e: any) {
        resultStr = JSON.stringify({ error: e.message });
      }
      onEvent({ type: 'tool_result', name, summary: resultStr.slice(0, 200) });
      AssistantConversationModel.appendMessage(conversationId, {
        role: 'tool', content: resultStr, toolCallId: tc.id,
        timestamp: new Date().toISOString(),
      });
      messages.push({ role: 'tool', content: resultStr, tool_call_id: tc.id });
    }
  }

  onEvent({ type: 'error', message: `assistant exceeded MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}` });
}
