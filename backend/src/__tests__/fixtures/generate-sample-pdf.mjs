// Run once to (re)generate sample.pdf:
//   node src/__tests__/fixtures/generate-sample-pdf.mjs
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'sample.pdf');
const doc = new PDFDocument({ size: 'A4' });
doc.pipe(fs.createWriteStream(out));
doc.fontSize(24).text('Concepts page', { align: 'left' });
doc.text('The variable X is bounded by the configured limit.');
doc.addPage();
doc.fontSize(24).text('Usage page', { align: 'left' });
doc.text('Use foo(1) when you want to do thing.');
doc.end();
console.log('Wrote', out);
