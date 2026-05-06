import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptRunner } from '../services/scriptRunner';

describe('http-request allowlist enforcement', () => {
  beforeEach(() => {
    process.env.HTTP_ALLOWLIST = 'localhost,127.0.0.1';
    delete process.env.VLLM_BASE_URL;
  });

  it('rejects a non-allowlisted URL with a clear error', async () => {
    const result = await ScriptRunner.executeHttpRequest(
      { url: 'https://example.com', method: 'GET' },
      {}
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowlist/i);
    expect(result.error).toMatch(/example\.com/);
  });
});
