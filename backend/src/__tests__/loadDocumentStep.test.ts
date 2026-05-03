import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { StepExecutor } from '../services/stepExecutor';
import type { Step } from '../types/workflow';

describe('load-document step', () => {
  beforeAll(() => {
    process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-ld-'));
  });

  it('returns chunks for a TXT input path', async () => {
    const txtPath = path.join(__dirname, 'fixtures', 'sample.txt');
    const step: Step = {
      id: 'ld-1',
      name: 'load',
      type: 'load-document',
      position: { x: 0, y: 0 },
      config: {
        loadDocumentSourcePath: txtPath,
        loadDocumentMaxChunkChars: 10000,
      },
    };
    const result = await StepExecutor.executeStepByType(step, {
      variables: { executionId: 'exec-ld-1' },
      steps: {},
      simulate: false,
    }, {});
    expect(result.success).toBe(true);
    expect(result.output.chunks.length).toBe(1);
    expect(result.output.chunks[0].pageId).toBe('chunk-1');
  });
});
