export interface ErrorPolicy {
  onError: 'stop' | 'continue' | 'retry';
  retryCount?: number;
  errorBranch?: string;
}

export type PolicyOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'failure-stop'; error: Error }
  | { kind: 'failure-continue'; error: Error; errorBranch?: string };

export async function runWithPolicy<T>(
  fn: () => Promise<T>,
  policy: ErrorPolicy | undefined
): Promise<PolicyOutcome<T>> {
  const p = policy ?? { onError: 'stop' };
  const maxAttempts = p.onError === 'retry' ? Math.max(1, p.retryCount ?? 1) : 1;
  let lastError: Error | undefined;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const v = await fn();
      return { kind: 'success', value: v };
    } catch (e) {
      lastError = e as Error;
      if (i < maxAttempts - 1) {
        const backoff = Math.min(30000, 1000 * Math.pow(2, i));
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  if (p.onError === 'continue' || p.onError === 'retry') {
    return { kind: 'failure-continue', error: lastError!, errorBranch: p.errorBranch };
  }
  return { kind: 'failure-stop', error: lastError! };
}
