import fs from 'fs/promises';
import path from 'path';
import { RawPage } from '../hybridChunking';
import { ENV_UPLOADS_ROOT } from '../../middleware/uploadHandler';

const LONG_SIDE = Number(process.env.IMAGE_LONG_SIDE_PX || 1568);
const RENDER_DPI = 150;

export async function loadPdf(
  filePath: string,
  executionId: string
): Promise<RawPage[]> {
  // pdfjs-dist legacy build for Node. Avoid worker; use disableFontFace to keep it light.
  // @ts-ignore — legacy build has no TS types
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Use whichever canvas implementation is installed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createCanvas: any;
  try {
    ({ createCanvas } = await import('canvas'));
  } catch {
    ({ createCanvas } = await import('@napi-rs/canvas'));
  }

  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;

  const outDir = path.join(ENV_UPLOADS_ROOT, executionId);
  await fs.mkdir(outDir, { recursive: true });

  const pages: RawPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = textContent.items.map((it: any) => it.str).join(' ').trim();

    // Compute final scale so the long side is at most LONG_SIDE px.
    const baseViewport = page.getViewport({ scale: 1 });
    const baseLong = Math.max(baseViewport.width, baseViewport.height);
    const dpiScale = RENDER_DPI / 72;
    const scaledLong = baseLong * dpiScale;
    const finalScale = scaledLong > LONG_SIDE
      ? dpiScale * (LONG_SIDE / scaledLong)
      : dpiScale;
    const viewport = page.getViewport({ scale: finalScale });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvas: null, canvasContext: ctx as any, viewport }).promise;

    const imagePath = path.join(outDir, `page-${i}.png`);
    await fs.writeFile(imagePath, canvas.toBuffer('image/png'));

    pages.push({ pageId: `page-${i}`, text, imagePath });
  }
  return pages;
}
