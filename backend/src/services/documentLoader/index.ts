import path from 'path';
import { loadTxt } from './txt';
import { applyHybridChunking, RawPage } from '../hybridChunking';

export interface LoadDocumentOptions {
  executionId: string;
  maxChunkChars?: number;
}

export async function loadDocument(
  filePath: string,
  opts: LoadDocumentOptions
): Promise<RawPage[]> {
  const ext = path.extname(filePath).toLowerCase();
  let raw: RawPage[];
  switch (ext) {
    case '.txt':
      raw = await loadTxt(filePath);
      break;
    case '.pdf':
      throw new Error('PDF loader not yet implemented');
    case '.pptx':
      throw new Error('PPTX loader not yet implemented');
    default:
      throw new Error(`Unsupported document extension: ${ext}`);
  }
  return applyHybridChunking(raw, opts.maxChunkChars ?? 2000);
}

export type { RawPage } from '../hybridChunking';
