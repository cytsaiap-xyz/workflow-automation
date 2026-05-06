import { describe, it, expect } from 'vitest';
import { applyHybridChunking } from '../services/hybridChunking';

describe('applyHybridChunking', () => {
  const MAX = 50;

  it('preserves short pages as a single chunk', () => {
    const out = applyHybridChunking([{ pageId: 'page-1', text: 'short text', imagePath: null }], MAX);
    expect(out).toEqual([{ pageId: 'page-1', text: 'short text', imagePath: null }]);
  });

  it('splits long pages at sentence boundaries', () => {
    const longText = 'A.'.padEnd(40, ' ') + ' ' + 'B.'.padEnd(40, ' ') + ' ' + 'C.'.padEnd(40, ' ');
    const out = applyHybridChunking([{ pageId: 'page-2', text: longText, imagePath: '/img.png' }], MAX);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].pageId).toBe('page-2-chunk-1');
    expect(out[0].imagePath).toBe('/img.png');
  });

  it('treats TXT-style chunk- inputs without further splitting if short', () => {
    const out = applyHybridChunking([{ pageId: 'chunk-1', text: 'hello', imagePath: null }], MAX);
    expect(out[0].pageId).toBe('chunk-1');
  });
});
