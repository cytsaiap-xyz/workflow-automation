import OpenAI from 'openai';
import { StepConfig } from '../types/workflow';
import { ScriptRunner, ScriptResult } from './scriptRunner';
import { createLogger } from '../utils/logger';

const log = createLogger('aiExecutor');

export class AiExecutor {
  /**
   * Create an OpenAI client configured for the vLLM server
   */
  private static createClient(config: StepConfig): OpenAI {
    return new OpenAI({
      baseURL: config.aiBaseUrl,
      apiKey: config.aiApiKey || 'not-needed', // vLLM may not require API key
      defaultHeaders: config.aiHeaders || {},
    });
  }

  /**
   * AI Prompt - single LLM completion call
   */
  static async executePrompt(
    config: StepConfig,
    inputContext: Record<string, any>
  ): Promise<ScriptResult> {
    const logs: string[] = [];
    try {
      const client = this.createClient(config);
      const prompt = ScriptRunner.interpolateVariables(config.aiPrompt || '', inputContext);
      const systemPrompt = config.aiSystemPrompt
        ? ScriptRunner.interpolateVariables(config.aiSystemPrompt, inputContext)
        : undefined;

      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      logs.push(`Sending prompt to ${config.aiBaseUrl} (model: ${config.aiModel})`);

      const completion = await client.chat.completions.create({
        model: config.aiModel || 'default',
        messages,
        temperature: config.aiTemperature ?? 0.7,
        max_tokens: config.aiMaxTokens ?? 2048,
      });

      const response = completion.choices[0]?.message?.content || '';
      const usage = completion.usage;

      logs.push(`Response received (${usage?.total_tokens ?? '?'} tokens)`);

      // Try to parse response as JSON
      let parsed: any = response;
      try {
        parsed = JSON.parse(response);
      } catch {
        // Keep as string
      }

      return {
        success: true,
        output: {
          response,
          parsed,
          model: completion.model,
          usage: usage ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          } : undefined,
        },
        logs,
      };
    } catch (error: any) {
      log.error(`AI Prompt failed: ${error.message}`);
      return {
        success: false,
        error: `AI Prompt failed: ${error.message}`,
        logs,
      };
    }
  }

  /**
   * AI Structured Output - LLM call that returns JSON matching a schema
   */
  static async executeStructuredOutput(
    config: StepConfig,
    inputContext: Record<string, any>
  ): Promise<ScriptResult> {
    const logs: string[] = [];
    try {
      const client = this.createClient(config);
      const prompt = ScriptRunner.interpolateVariables(config.aiPrompt || '', inputContext);
      const systemPrompt = config.aiSystemPrompt
        ? ScriptRunner.interpolateVariables(config.aiSystemPrompt, inputContext)
        : 'You are a helpful assistant. Respond with valid JSON only.';

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      logs.push(`Sending structured output request to ${config.aiBaseUrl} (model: ${config.aiModel})`);

      // Build request params
      const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model: config.aiModel || 'default',
        messages,
        temperature: config.aiTemperature ?? 0.3,
        max_tokens: config.aiMaxTokens ?? 2048,
      };

      // If schema provided, use response_format
      if (config.aiOutputSchema) {
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            schema: config.aiOutputSchema,
            strict: true,
          },
        };
      } else {
        params.response_format = { type: 'json_object' };
      }

      const completion = await client.chat.completions.create(params);
      const raw = completion.choices[0]?.message?.content || '{}';
      const usage = completion.usage;

      logs.push(`Response received (${usage?.total_tokens ?? '?'} tokens)`);

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
        logs.push('Response successfully parsed as JSON');
      } catch {
        logs.push('Warning: Response is not valid JSON, returning raw string');
        parsed = raw;
      }

      return {
        success: true,
        output: {
          parsed,
          raw,
          model: completion.model,
          usage: usage ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          } : undefined,
        },
        logs,
      };
    } catch (error: any) {
      log.error(`AI Structured Output failed: ${error.message}`);
      return {
        success: false,
        error: `AI Structured Output failed: ${error.message}`,
        logs,
      };
    }
  }

  /**
   * AI Agent - agentic tool-use loop
   */
  static async executeAgent(
    config: StepConfig,
    inputContext: Record<string, any>
  ): Promise<ScriptResult> {
    const logs: string[] = [];
    const maxIterations = config.aiMaxIterations || 10;
    const allToolCalls: any[] = [];

    try {
      const client = this.createClient(config);
      const prompt = ScriptRunner.interpolateVariables(config.aiPrompt || '', inputContext);
      const systemPrompt = config.aiSystemPrompt
        ? ScriptRunner.interpolateVariables(config.aiSystemPrompt, inputContext)
        : undefined;

      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      // Build tools array for the API
      const tools: OpenAI.ChatCompletionTool[] | undefined = config.aiTools?.map(t => ({
        type: 'function' as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }));

      logs.push(`Starting agent loop (max ${maxIterations} iterations, ${tools?.length || 0} tools)`);

      let iterations = 0;

      while (iterations < maxIterations) {
        iterations++;

        const completion = await client.chat.completions.create({
          model: config.aiModel || 'default',
          messages,
          temperature: config.aiTemperature ?? 0.7,
          max_tokens: config.aiMaxTokens ?? 2048,
          ...(tools && tools.length > 0 ? { tools } : {}),
        });

        const choice = completion.choices[0];
        const assistantMessage = choice.message;
        messages.push(assistantMessage);

        // If no tool calls, agent is done
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          logs.push(`Agent completed after ${iterations} iteration(s)`);
          const response = assistantMessage.content || '';

          let parsed: any = response;
          try { parsed = JSON.parse(response); } catch { /* keep string */ }

          return {
            success: true,
            output: {
              response,
              parsed,
              toolCalls: allToolCalls,
              iterations,
              model: completion.model,
              usage: completion.usage ? {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens,
              } : undefined,
            },
            logs,
          };
        }

        // Process tool calls
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;
          const fnName = toolCall.function.name;
          const fnArgs = toolCall.function.arguments;

          logs.push(`Iteration ${iterations}: Calling tool "${fnName}"`);
          allToolCalls.push({ name: fnName, arguments: fnArgs, iteration: iterations });

          // Execute tool via sandboxed JS
          let toolResult: string;
          try {
            const toolCode = `
              const args = ${fnArgs};
              const fn = this["${fnName}"];
              if (typeof fn === 'function') {
                return fn(args);
              }
              return { error: 'Tool not found: ${fnName}' };
            `;
            const scriptResult = await ScriptRunner.executeJS(toolCode, inputContext, 10000);
            toolResult = JSON.stringify(scriptResult.output ?? scriptResult.error ?? 'No result');
          } catch (e: any) {
            toolResult = JSON.stringify({ error: e.message });
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      // Max iterations reached
      logs.push(`Agent reached max iterations (${maxIterations})`);
      const lastMessage = messages[messages.length - 1];
      const finalContent = typeof lastMessage === 'object' && 'content' in lastMessage
        ? (lastMessage.content as string || '')
        : '';

      return {
        success: true,
        output: {
          response: finalContent,
          toolCalls: allToolCalls,
          iterations: maxIterations,
          reachedLimit: true,
        },
        logs,
      };
    } catch (error: any) {
      log.error(`AI Agent failed: ${error.message}`);
      return {
        success: false,
        error: `AI Agent failed: ${error.message}`,
        output: { toolCalls: allToolCalls },
        logs,
      };
    }
  }

  /**
   * AI Router - LLM-based multi-branch routing decision
   */
  static async executeRouter(
    config: StepConfig,
    inputContext: Record<string, any>
  ): Promise<ScriptResult> {
    const logs: string[] = [];
    try {
      const client = this.createClient(config);
      const prompt = ScriptRunner.interpolateVariables(config.aiPrompt || '', inputContext);

      // Build route descriptions for the LLM
      const routes = config.aiRoutes || [];
      const routeDescriptions = routes
        .map((r: any) => `- "${r.branchId}": ${r.description}`)
        .join('\n');
      const validBranchIds = routes.map((r: any) => r.branchId);

      const systemPrompt = ScriptRunner.interpolateVariables(
        config.aiSystemPrompt || 'You are a routing assistant. Analyze the input and decide which route to take.',
        inputContext
      );

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `${systemPrompt}\n\nAvailable routes:\n${routeDescriptions}\n\nRespond with a JSON object: { "branch": "<branchId>", "reasoning": "<brief explanation>" }\nYou MUST pick exactly one of the available branch IDs.`
        },
        { role: 'user', content: prompt },
      ];

      logs.push(`Routing decision via ${config.aiBaseUrl} (model: ${config.aiModel}, ${routes.length} routes)`);

      const completion = await client.chat.completions.create({
        model: config.aiModel || 'default',
        messages,
        temperature: config.aiTemperature ?? 0.3,
        max_tokens: config.aiMaxTokens ?? 256,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const usage = completion.usage;

      let parsed: { branch?: string; reasoning?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        logs.push('Warning: LLM response is not valid JSON, using first route as fallback');
        parsed = { branch: validBranchIds[0], reasoning: 'Fallback: could not parse LLM response' };
      }

      // Validate branch
      const branch = parsed.branch || validBranchIds[0];
      if (!validBranchIds.includes(branch)) {
        logs.push(`Warning: LLM chose "${branch}" which is not a valid route, using first route as fallback`);
        parsed.branch = validBranchIds[0];
        parsed.reasoning = `Fallback: LLM chose invalid route "${branch}"`;
      }

      const finalBranch = parsed.branch || validBranchIds[0];
      logs.push(`Route selected: "${finalBranch}" - ${parsed.reasoning || 'no reasoning provided'}`);

      return {
        success: true,
        output: {
          branch: finalBranch,
          reasoning: parsed.reasoning || '',
          allRoutes: validBranchIds,
          model: completion.model,
          usage: usage ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          } : undefined,
        },
        logs,
      };
    } catch (error: any) {
      log.error(`AI Router failed: ${error.message}`);
      return {
        success: false,
        error: `AI Router failed: ${error.message}`,
        logs,
      };
    }
  }
}
