export interface RawPage {
  pageId: string;
  text: string;
  imagePath: string | null;
}

function splitAtSentenceBoundaries(text: string, maxChars: number): string[] {
  // Match each sentence including any trailing whitespace so lengths are preserved.
  const sentenceRegex = /[^.!?]*[.!?]\s*|[^.!?]+/g;
  const sentences = text.match(sentenceRegex) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (current.length + s.length > maxChars) {
      if (current) chunks.push(current.trim());
      // If a single sentence is itself longer than maxChars, hard-split it.
      if (s.trim().length > maxChars) {
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars).trim());
        }
        current = '';
      } else {
        current = s;
      }
    } else {
      current = current + s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function applyHybridChunking(pages: RawPage[], maxChars: number): RawPage[] {
  const out: RawPage[] = [];
  for (const page of pages) {
    if (page.text.length <= maxChars) {
      out.push(page);
      continue;
    }
    const subs = splitAtSentenceBoundaries(page.text, maxChars);
    subs.forEach((text, i) => {
      out.push({
        pageId: `${page.pageId}-chunk-${i + 1}`,
        text,
        imagePath: page.imagePath,
      });
    });
  }
  return out;
}
