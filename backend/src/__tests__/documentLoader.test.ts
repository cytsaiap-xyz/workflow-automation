import { describe, it, expect } from 'vitest';
import path from 'path';
import { loadDocument } from '../services/documentLoader';

const fixtures = path.join(__dirname, 'fixtures');

describe('documentLoader', () => {
  describe('TXT', () => {
    it('loads a TXT file as a single chunk-1', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.txt'), {
        executionId: 'exec-1',
        maxChunkChars: 10000,
      });
      expect(out.length).toBe(1);
      expect(out[0].pageId).toBe('chunk-1');
      expect(out[0].text).toContain('Concepts');
      expect(out[0].imagePath).toBeNull();
    });
  });
});
