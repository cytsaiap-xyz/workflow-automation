import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Set UPLOADS_DIR before any module that imports uploadHandler is loaded
const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-pdfimg-'));
process.env.UPLOADS_DIR = tmpUploads;

// Dynamic import so the env var takes effect before uploadHandler is imported
let loadDocument: typeof import('../services/documentLoader').loadDocument;

const fixtures = path.join(__dirname, 'fixtures');

describe('documentLoader', () => {
  beforeAll(async () => {
    loadDocument = (await import('../services/documentLoader')).loadDocument;
  });

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

  describe('PDF', () => {
    it('loads each page with its text', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.pdf'), {
        executionId: 'exec-pdf-1',
        maxChunkChars: 10000,
      });
      expect(out.length).toBeGreaterThanOrEqual(2);
      expect(out[0].pageId).toBe('page-1');
      expect(out[0].text).toContain('Concepts page');
      expect(out[1].pageId).toBe('page-2');
      expect(out[1].text).toContain('Usage page');
    });

    it('rasterizes each page to a PNG file', async () => {
      const out = await loadDocument(path.join(fixtures, 'sample.pdf'), {
        executionId: 'exec-pdf-img',
        maxChunkChars: 10000,
      });
      expect(out[0].imagePath).toBeTruthy();
      expect(out[0].imagePath).toMatch(/page-1\.png$/);
      expect(fs.existsSync(out[0].imagePath!)).toBe(true);
    });
  });
});
