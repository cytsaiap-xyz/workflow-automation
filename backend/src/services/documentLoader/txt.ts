import fs from 'fs/promises';
import { RawPage } from '../hybridChunking';

export async function loadTxt(filePath: string): Promise<RawPage[]> {
  const text = await fs.readFile(filePath, 'utf8');
  return [{ pageId: 'chunk-1', text, imagePath: null }];
}
