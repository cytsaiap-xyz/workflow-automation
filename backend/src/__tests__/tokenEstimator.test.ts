import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../services/tokenEstimator';

describe('estimateTokens', () => {
  it('returns ceil(chars / 3.5)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('hello world')).toBe(4); // 11 chars / 3.5 = 3.14 → 4
  });
});
