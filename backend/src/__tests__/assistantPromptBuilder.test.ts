import { describe, it, expect } from 'vitest';
import { buildAssistantSystemPrompt } from '../services/assistantPromptBuilder';

describe('buildAssistantSystemPrompt', () => {
  it('mentions offline guardrails and tool names', () => {
    const sp = buildAssistantSystemPrompt({ surface: 'panel' });
    expect(sp).toMatch(/offline/i);
    expect(sp).toMatch(/get_workflow/);
    expect(sp).toMatch(/propose_workflow_change/);
  });

  it('node-popover surface focuses on prompt editing', () => {
    const sp = buildAssistantSystemPrompt({ surface: 'node-popover', nodeId: 'n1' });
    expect(sp).toMatch(/set_node_prompt/);
    expect(sp).toMatch(/n1/);
  });
});
