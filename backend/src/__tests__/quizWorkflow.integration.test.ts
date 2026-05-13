import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('Quiz workflow E2E', () => {
  let app: express.Express;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-e2e-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');
    process.env.VLLM_BASE_URL = 'http://localhost:8000/v1';
    process.env.VLLM_DEFAULT_MODEL = 'qwen2-vl-7b';
    process.env.VLLM_SUPPORTS_VISION = 'true';
    process.env.HTTP_ALLOWLIST = 'localhost,127.0.0.1';

    // Stub OpenAI before importing services that use it.
    // The stub returns shape-appropriate responses based on the system prompt content.
    vi.doMock('openai', () => ({
      default: class {
        chat = { completions: { create: async (params: any) => {
          const sysContent = String(params.messages?.[0]?.content || '');
          const isAnalyzer = /focus-area analyst/.test(sysContent);
          const isReviewer = /focus-area conformance reviewer/.test(sysContent);
          const isVerifier = /source-grounding verifier/.test(sysContent);
          const isFixer = /repair flagged quiz/.test(sysContent);

          if (isAnalyzer) {
            return {
              choices: [{ message: { content:
                '{"refined_focus":"concept and logic","must_cover":["concepts"],"avoid":["defaults"]}'
              } }],
              model: 'qwen2-vl-7b',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          }
          if (isReviewer || isVerifier) {
            // all_pass=true routes the workflow through the "skip fixer" branch.
            return {
              choices: [{ message: { content:
                '{"results":[{"question_index":0,"pass":true,"issue":null}],"all_pass":true,"has_failures":false}'
              } }],
              model: 'qwen2-vl-7b',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          }
          if (isFixer) {
            return {
              choices: [{ message: { content: '{"fixed_questions":[]}' } }],
              model: 'qwen2-vl-7b',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            };
          }
          // Generator (default branch)
          return {
            choices: [{ message: { content:
              '{"questions":[{"reference_page":"chunk-1","question":"Q?","options":["A. a","B. b","C. c","D. d"],"answer":"B","explanation":"because"}]}'
            } }],
            model: 'qwen2-vl-7b',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        }}};
      }
    }));

    vi.resetModules();

    const { initDatabase } = await import('../db/database');
    await initDatabase();
    const { seedAiProvider } = await import('../seeds/seedAiProvider');
    const { seedPromptTemplates } = await import('../seeds/seedPromptTemplates');
    const { seedQuizWorkflow } = await import('../seeds/seedQuizWorkflow');
    seedAiProvider();
    seedPromptTemplates();
    seedQuizWorkflow();

    const router = (await import('../routes/workflows')).default;
    app = express();
    app.use(express.json());
    app.use('/api/workflows', router);
  });

  it('runs the built-in quiz workflow against a TXT input', async () => {
    const txt = path.join(__dirname, 'fixtures', 'sample.txt');
    const res = await request(app)
      .post('/api/workflows/builtin-quiz-generator/execute')
      .field('focus_area', 'concept and logic')
      .field('questions_per_chunk', '1')
      .attach('file', txt);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // The v2 DAG engine produces one synthetic station containing all node step results.
    const stations = res.body.data.result.stations;
    expect(stations.length).toBe(1);
    // The 8-node DAG (load, analyzer, generator, verifier, reviewer, fixer, collect, writer).
    // When verifier+reviewer both pass, the fixer node is skipped via edge when-conditions.
    // Find the writer step by its node id (stepId field in v2 DAG results).
    const writerStep = stations[0].steps.find((s: any) => s.stepId === 'writer');
    expect(writerStep).toBeTruthy();
    const writerOutput = writerStep.output;
    expect(writerOutput.json.questions.length).toBeGreaterThan(0);
    expect(writerOutput.json.questions[0].answer).toBe('B');
    expect(fs.existsSync(writerOutput.filePath)).toBe(true);
  });
});
