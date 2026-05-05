import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('DAG quiz workflow E2E', () => {
  let app: express.Express;

  beforeAll(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-e2e-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');
    process.env.VLLM_BASE_URL = 'http://localhost:8000/v1';
    process.env.VLLM_DEFAULT_MODEL = 'qwen2-vl-7b';
    process.env.VLLM_SUPPORTS_VISION = 'true';
    process.env.HTTP_ALLOWLIST = 'localhost,127.0.0.1';

    vi.doMock('openai', () => ({
      default: class {
        chat = { completions: { create: async (params: any) => {
          const sysContent = String(params.messages?.[0]?.content || '');
          const isReviewer = /reviewer|focus-area conformance/i.test(sysContent);
          const isVerifier = /verifier|source-grounding/i.test(sysContent);
          const isFixer = /repair flagged quiz|fixer/i.test(sysContent);

          if (isReviewer || isVerifier) {
            return {
              choices: [{ message: { content: '{"results":[{"question_index":0,"pass":true,"issue":null}]}' } }],
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
          // Generator (default)
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

  it('runs the v2 DAG quiz workflow end-to-end and produces a writer output', async () => {
    const txt = path.join(__dirname, 'fixtures', 'sample.txt');
    const res = await request(app)
      .post('/api/workflows/builtin-quiz-generator/execute')
      .field('focus_area', 'concept and logic')
      .field('questions_per_chunk', '1')
      .attach('file', txt);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const stations = res.body.data.result.stations;
    // v2 produces ONE synthetic station (S3-T11 contract).
    expect(stations.length).toBe(1);
    const dagStation = stations[0];

    // 7 nodes in the DAG → at least 6 step results (generator may fan-out producing
    // multiple entries, but all 7 logical nodes should appear at minimum in total count).
    expect(dagStation.steps.length).toBeGreaterThanOrEqual(6);

    // The writer node must be the LAST step result recorded.
    const lastStep = dagStation.steps[dagStation.steps.length - 1];
    expect(lastStep.stepId).toBe('writer');

    // The writer step must produce valid output including a non-empty questions array.
    const writer = dagStation.steps.find((s: any) => s.stepId === 'writer');
    expect(writer).toBeTruthy();
    expect(writer.output.json.questions.length).toBeGreaterThan(0);

    // The generated JSON file must exist on disk.
    expect(fs.existsSync(writer.output.filePath)).toBe(true);

    // Fan-out: generator ran at least once per chunk (sample.txt produces ≥1 chunk).
    // Because the generator node fan-outs, each per-chunk execution is recorded as a
    // separate step result entry (or the node runs once per chunk sequentially).
    // Either way the generator stepId must appear in the results.
    const generatorSteps = dagStation.steps.filter((s: any) => s.stepId === 'generator');
    expect(generatorSteps.length).toBeGreaterThanOrEqual(1);

    // reviewer and verifier must appear after the generator step(s).
    const generatorLastIdx = dagStation.steps.reduce(
      (last: number, s: any, idx: number) => (s.stepId === 'generator' ? idx : last),
      -1,
    );
    const reviewerIdx = dagStation.steps.findIndex((s: any) => s.stepId === 'reviewer');
    const verifierIdx = dagStation.steps.findIndex((s: any) => s.stepId === 'verifier');
    expect(reviewerIdx).toBeGreaterThan(generatorLastIdx);
    expect(verifierIdx).toBeGreaterThan(generatorLastIdx);

    // All expected DAG node IDs must be present in the results.
    const stepIds = new Set(dagStation.steps.map((s: any) => s.stepId));
    for (const nodeId of ['load', 'generator', 'reviewer', 'verifier', 'fix-loop', 'collect', 'writer']) {
      expect(stepIds.has(nodeId)).toBe(true);
    }
  });
});
