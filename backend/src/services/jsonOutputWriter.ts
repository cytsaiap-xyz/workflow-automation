import fs from 'fs/promises';
import path from 'path';
import { ENV_UPLOADS_ROOT } from '../middleware/uploadHandler';

export interface JsonOutputWriterOptions {
  executionId: string;
  directory?: string;
  filename?: string;
  pretty?: boolean;
}

export async function writeJsonOutput(
  body: unknown,
  opts: JsonOutputWriterOptions
): Promise<{ filePath: string }> {
  const dir = opts.directory || path.join(ENV_UPLOADS_ROOT, opts.executionId);
  await fs.mkdir(dir, { recursive: true });
  const filename = opts.filename || 'output.json';
  const filePath = path.join(dir, filename);
  const serialized = opts.pretty === false
    ? JSON.stringify(body)
    : JSON.stringify(body, null, 2);
  await fs.writeFile(filePath, serialized, 'utf8');
  return { filePath };
}
