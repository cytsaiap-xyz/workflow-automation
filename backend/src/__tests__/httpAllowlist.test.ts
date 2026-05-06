import { describe, it, expect } from 'vitest';
import { isHostAllowed, parseAllowlist } from '../services/httpAllowlist';

describe('httpAllowlist', () => {
  it('allows loopback by default', () => {
    expect(isHostAllowed('http://127.0.0.1:8000/v1', ['localhost', '127.0.0.1', '::1'])).toBe(true);
    expect(isHostAllowed('http://localhost:5000', ['localhost', '127.0.0.1', '::1'])).toBe(true);
  });

  it('blocks unlisted hosts', () => {
    expect(isHostAllowed('https://example.com', ['localhost'])).toBe(false);
  });

  it('honors CIDR ranges', () => {
    expect(isHostAllowed('http://10.0.5.7:80', ['10.0.0.0/8'])).toBe(true);
    expect(isHostAllowed('http://192.168.0.1', ['10.0.0.0/8'])).toBe(false);
  });

  it('parses an empty allowlist string as default loopback', () => {
    expect(parseAllowlist('')).toEqual(['localhost', '127.0.0.1', '::1']);
  });

  it('parses comma-separated env values', () => {
    expect(parseAllowlist('localhost, vllm.internal, 10.0.0.0/8'))
      .toEqual(['localhost', 'vllm.internal', '10.0.0.0/8']);
  });
});
