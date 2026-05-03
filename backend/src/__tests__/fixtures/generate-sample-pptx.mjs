// Run once to (re)generate sample.pptx:
//   node src/__tests__/fixtures/generate-sample-pptx.mjs
import pptxgen from 'pptxgenjs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pres = new pptxgen();

const s1 = pres.addSlide();
s1.addText('Concept slide', { x: 1, y: 1, fontSize: 24, bold: true });
s1.addText('The variable Y is bounded by Z.', { x: 1, y: 2, fontSize: 14 });

const s2 = pres.addSlide();
s2.addText('Usage slide', { x: 1, y: 1, fontSize: 24, bold: true });
s2.addText('Use bar(2) when needed.', { x: 1, y: 2, fontSize: 14 });

await pres.writeFile({ fileName: path.join(here, 'sample.pptx') });
console.log('Wrote', path.join(here, 'sample.pptx'));
