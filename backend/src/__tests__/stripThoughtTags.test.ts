import { describe, it, expect } from 'vitest';
import { stripThoughtTags } from '../services/aiExecutor';

describe('stripThoughtTags', () => {
  it('removes a single thought block', () => {
    expect(stripThoughtTags('<thought>reasoning</thought>answer')).toBe('answer');
  });
  it('removes multi-line thought', () => {
    expect(stripThoughtTags('<thought>line1\nline2</thought>visible')).toBe('visible');
  });
  it('removes multiple thought blocks non-greedily', () => {
    expect(stripThoughtTags('<thought>a</thought>x<thought>b</thought>y')).toBe('xy');
  });
  it('leaves non-thought content alone', () => {
    expect(stripThoughtTags('plain answer')).toBe('plain answer');
  });
  it('strips when thought block is at the end', () => {
    expect(stripThoughtTags('answer<thought>after</thought>')).toBe('answer');
  });
});
