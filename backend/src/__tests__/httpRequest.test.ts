import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScriptRunner } from '../services/scriptRunner';
import { EventEmitter } from 'events';

// Mock both http and https modules
vi.mock('http', async () => {
  const actual = await vi.importActual<typeof import('http')>('http');
  return { ...actual, request: vi.fn() };
});
vi.mock('https', async () => {
  const actual = await vi.importActual<typeof import('https')>('https');
  return { ...actual, request: vi.fn() };
});

import * as http from 'http';
import * as https from 'https';

// Helper to create a mock response
function createMockResponse(statusCode: number, statusMessage: string, body: string) {
  const res = new EventEmitter() as any;
  res.statusCode = statusCode;
  res.statusMessage = statusMessage;
  process.nextTick(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  });
  return res;
}

// Helper to create a mock request
function createMockRequest() {
  const req = new EventEmitter() as any;
  req.write = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

describe('HTTP Request Step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Allow api.example.com so the mocked http tests are not blocked by the allowlist guard
    process.env.HTTP_ALLOWLIST = 'localhost,127.0.0.1,api.example.com';
    delete process.env.VLLM_BASE_URL;
  });

  it('makes a GET request and returns response', async () => {
    const mockRes = createMockResponse(200, 'OK', JSON.stringify({ data: 'hello' }));
    const mockReq = createMockRequest();

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      cb(mockRes);
      return mockReq;
    });

    const result = await ScriptRunner.executeHttpRequest(
      { url: 'https://api.example.com/data', method: 'GET' },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.output.status).toBe(200);
    expect(result.output.data).toEqual({ data: 'hello' });
    expect(https.request).toHaveBeenCalled();
    const callOpts = vi.mocked(https.request).mock.calls[0][0] as any;
    expect(callOpts.method).toBe('GET');
    expect(callOpts.hostname).toBe('api.example.com');
    expect(callOpts.path).toBe('/data');
  });

  it('makes a POST request with body', async () => {
    const mockRes = createMockResponse(201, 'Created', JSON.stringify({ id: 1 }));
    const mockReq = createMockRequest();

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      cb(mockRes);
      return mockReq;
    });

    const result = await ScriptRunner.executeHttpRequest(
      { url: 'https://api.example.com/items', method: 'POST', body: '{"name":"test"}' },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.output.status).toBe(201);
    const callOpts = vi.mocked(https.request).mock.calls[0][0] as any;
    expect(callOpts.method).toBe('POST');
    expect(mockReq.write).toHaveBeenCalledWith('{"name":"test"}');
  });

  it('handles non-ok response as failure', async () => {
    const mockRes = createMockResponse(404, 'Not Found', 'Not found');
    const mockReq = createMockRequest();

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      cb(mockRes);
      return mockReq;
    });

    const result = await ScriptRunner.executeHttpRequest(
      { url: 'https://api.example.com/missing', method: 'GET' },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  it('handles network errors', async () => {
    const mockReq = createMockRequest();

    vi.mocked(https.request).mockImplementation((_opts: any, _cb: any) => {
      process.nextTick(() => mockReq.emit('error', new Error('Network failure')));
      return mockReq;
    });

    const result = await ScriptRunner.executeHttpRequest(
      { url: 'https://api.example.com/down', method: 'GET' },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });

  it('interpolates variables in URL', async () => {
    const mockRes = createMockResponse(200, 'OK', '{}');
    const mockReq = createMockRequest();

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      cb(mockRes);
      return mockReq;
    });

    await ScriptRunner.executeHttpRequest(
      { url: 'https://api.example.com/users/${userId}', method: 'GET' },
      { userId: '123' }
    );

    const callOpts = vi.mocked(https.request).mock.calls[0][0] as any;
    expect(callOpts.path).toBe('/users/123');
  });

  it('passes custom headers', async () => {
    const mockRes = createMockResponse(200, 'OK', '{}');
    const mockReq = createMockRequest();

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      cb(mockRes);
      return mockReq;
    });

    await ScriptRunner.executeHttpRequest(
      { url: 'https://api.example.com', method: 'GET', headers: { Authorization: 'Bearer token123' } },
      {}
    );

    const callOpts = vi.mocked(https.request).mock.calls[0][0] as any;
    expect(callOpts.headers.Authorization).toBe('Bearer token123');
  });

  it('handles non-JSON response text', async () => {
    const mockRes = createMockResponse(200, 'OK', 'plain text response');
    const mockReq = createMockRequest();

    vi.mocked(https.request).mockImplementation((_opts: any, cb: any) => {
      cb(mockRes);
      return mockReq;
    });

    const result = await ScriptRunner.executeHttpRequest(
      { url: 'https://api.example.com', method: 'GET' },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.output.data).toBe('plain text response');
  });
});
