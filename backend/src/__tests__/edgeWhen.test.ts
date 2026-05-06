import { describe, it, expect } from 'vitest';
import { evaluateWhen } from '../services/edgeWhen';

describe('evaluateWhen', () => {
  it('returns true when expression is empty', () => {
    expect(evaluateWhen(undefined, {})).toBe(true);
    expect(evaluateWhen('', {})).toBe(true);
  });

  it('evaluates ${...} expressions against context', () => {
    expect(evaluateWhen('${output.status}', { output: { status: 'ok' } })).toBe(true);
    expect(evaluateWhen('${output.status}', { output: { status: '' } })).toBe(false);
  });

  it('coerces "false" / "0" to false', () => {
    expect(evaluateWhen('${output.x}', { output: { x: 'false' } })).toBe(false);
    expect(evaluateWhen('${output.x}', { output: { x: '0' } })).toBe(false);
    expect(evaluateWhen('${output.x}', { output: { x: 'true' } })).toBe(true);
  });
});
