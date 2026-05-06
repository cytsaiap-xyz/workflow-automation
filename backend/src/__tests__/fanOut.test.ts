import { describe, it, expect } from 'vitest';
import { fanOutInputs, collectFanOutOutputs } from '../services/fanOut';

describe('fanOut', () => {
  it('expands a node into one item per array element at inputArrayPath', () => {
    const items = fanOutInputs({ items: [1, 2, 3], extra: 'x' }, 'items');
    expect(items.length).toBe(3);
    expect(items[0]).toEqual({ items: 1, extra: 'x' });
    expect(items[2]).toEqual({ items: 3, extra: 'x' });
  });

  it('collects outputs preserving order', () => {
    const out = collectFanOutOutputs(['a', 'b', 'c']);
    expect(out).toEqual({ items: ['a', 'b', 'c'] });
  });
});
