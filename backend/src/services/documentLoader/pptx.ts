import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { RawPage } from '../hybridChunking';
import { ENV_UPLOADS_ROOT } from '../../middleware/uploadHandler';
import { createLogger } from '../../utils/logger';

const log = createLogger('pptxLoader');

async function extractSlideTexts(filePath: string): Promise<string[]> {
  // officeparser v6 returns an AST. For PPTX, top-level content nodes are
  // alternating 'slide' and 'note' nodes. We filter for type === 'slide'
  // and use the node's .text (concatenated text of the slide).
  const officeparser = await import('officeparser');
  const parseOffice = officeparser.parseOffice ?? officeparser.default?.parseOffice;
  if (typeof parseOffice !== 'function') {
    throw new Error('officeparser: parseOffice not found');
  }

  const ast = await parseOffice(filePath, { ignoreNotes: true });

  // Filter slide nodes (type === 'slide') and extract their text.
  const slideNodes = ast.content.filter(
    (node: { type: string; text?: string }) => node.type === 'slide'
  );

  if (slideNodes.length > 0) {
    const texts = slideNodes
      .map((node: { type: string; text?: string }) => (node.text ?? '').trim())
      .filter((t: string) => t.length > 0);
    if (texts.length > 0) return texts;
  }

  // Fallback: return entire document text as a single chunk.
  const fullText = ast.toText().trim();
  return fullText ? [fullText] : [];
}

async function rasterizeWithLibreOffice(
  filePath: string,
  outDir: string
): Promise<string[] | null> {
  return new Promise((resolve) => {
    const child = spawn('libreoffice', [
      '--headless',
      '--convert-to', 'png',
      '--outdir', outDir,
      filePath,
    ]);
    child.on('error', () => resolve(null));
    child.on('exit', async (code) => {
      if (code !== 0) return resolve(null);
      try {
        const all = await fs.readdir(outDir);
        const pngs = all.filter(f => f.endsWith('.png')).sort();
        resolve(pngs.map(f => path.join(outDir, f)));
      } catch {
        resolve(null);
      }
    });
  });
}

export async function loadPptx(
  filePath: string,
  executionId: string
): Promise<RawPage[]> {
  const outDir = path.join(ENV_UPLOADS_ROOT, executionId);
  await fs.mkdir(outDir, { recursive: true });

  const slideTexts = await extractSlideTexts(filePath);
  const slideImages = await rasterizeWithLibreOffice(filePath, outDir);
  if (!slideImages) {
    log.warn('libreoffice not available; PPTX slides will have no rasterized images');
  }

  return slideTexts.map((text, i) => ({
    pageId: `page-${i + 1}`,
    text,
    imagePath: slideImages?.[i] ?? null,
  }));
}
