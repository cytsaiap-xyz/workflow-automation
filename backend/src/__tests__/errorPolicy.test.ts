import { describe, it, expect } from 'vitest';
import { runWithPolicy } from '../services/errorPolicy';

describe('runWithPolicy', () => {
  it('passes through on success', async () => {
    const out = await runWithPolicy(async () => 'ok', { onError: 'stop' });
    expect(out).toEqual({ kind: 'success', value: 'ok' });
  });

  it('propagates failure when onError = stop', async () => {
    const out = await runWithPolicy(async () => { throw new Error('boom'); }, { onError: 'stop' });
    expect(out.kind).toBe('failure-stop');
    expect((out as any).error.message).toBe('boom');
  });

  it('returns null + failed flag when onError = continue', async () => {
    const out = await runWithPolicy(async () => { throw new Error('boom'); }, { onError: 'continue' });
    expect(out.kind).toBe('failure-continue');
  });

  it('retries up to retryCount, then succeeds', async () => {
    let n = 0;
    const out = await runWithPolicy(async () => {
      n++;
      if (n < 3) throw new Error('try again');
      return 'finally';
    }, { onError: 'retry', retryCount: 3 });
    expect(out).toEqual({ kind: 'success', value: 'finally' });
  });

  it('routes to errorBranch when failed under continue', async () => {
    const out = await runWithPolicy(async () => { throw new Error('boom'); }, { onError: 'continue', errorBranch: 'recover' });
    expect(out.kind).toBe('failure-continue');
    expect((out as any).errorBranch).toBe('recover');
  });
});
