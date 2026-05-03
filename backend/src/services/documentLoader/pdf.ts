import fs from 'fs/promises';
import { RawPage } from '../hybridChunking';

export async function loadPdf(
  filePath: string,
  _executionId: string
): Promise<RawPage[]> {
  // pdfjs-dist legacy build for Node. Avoid worker; use disableFontFace to keep it light.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;

  const pages: RawPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = textContent.items.map((it: any) => it.str).join(' ').trim();
    pages.push({
      pageId: `page-${i}`,
      text,
      imagePath: null,    // image rasterization handled in P6-T16
    });
  }
  return pages;
}
