import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoginProbe } from './loginProbe.js';
import { forwardRpcRequest } from './rpcProxy.js';

const request = vi.hoisted(() => vi.fn());
vi.mock('node:https', () => ({ request }));

const credentials = {
  host: 'vpn.example.test',
  port: 443,
  hub: '',
  password: 'dummy',
  allowSelfSigned: false,
  resolvedAddresses: [{ address: '192.0.2.1', family: 4 as const }],
};

const mockUpstream = (headers: Record<string, string> = {}) => {
  const upstream = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(),
    destroy: vi.fn(),
    end: vi.fn(),
  });
  const response = Object.assign(new EventEmitter(), { statusCode: 200, headers });
  request.mockReturnValueOnce(upstream);
  return { upstream, response };
};

describe('upstream response bounds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('decodes a response exactly at its byte limit after joining chunks', async () => {
    const { upstream, response } = mockUpstream({ 'content-type': 'application/json' });
    const body = '"\u20ac"';
    const bytes = Buffer.from(body);
    const result = forwardRpcRequest(credentials, '{}', { maxBytes: 5, deadlineMs: 100 });
    upstream.emit('response', response);
    response.emit('data', bytes.subarray(0, 2));
    response.emit('data', bytes.subarray(2));
    response.emit('end');
    response.emit('close');

    await expect(result).resolves.toEqual({
      statusCode: 200, contentType: 'application/json', body,
    });
    expect(upstream.destroy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows normal RPC replies larger than a probe', async () => {
    const { upstream, response } = mockUpstream();
    const body = JSON.stringify({ result: 'a'.repeat(16 * 1024) });
    const result = forwardRpcRequest(credentials, '{}');
    upstream.emit('response', response);
    response.emit('data', Buffer.from(body));
    response.emit('end');

    await expect(result).resolves.toMatchObject({ statusCode: 200, body });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts actual probe bytes even with a smaller declared length', async () => {
    const { upstream, response } = mockUpstream({ 'content-length': '1' });
    const result = createLoginProbe(forwardRpcRequest)(credentials);
    upstream.emit('response', response);
    response.emit('data', Buffer.alloc(16 * 1024, 32));
    expect(upstream.destroy).not.toHaveBeenCalled();
    response.emit('data', Buffer.from(' '));
    response.emit('end');

    await expect(result).rejects.toMatchObject({
      statusCode: 502, message: 'The selected server could not be reached.',
    });
    expect(upstream.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enforces the probe deadline despite response progress', async () => {
    const { upstream, response } = mockUpstream();
    const result = createLoginProbe(forwardRpcRequest)(credentials);
    vi.advanceTimersByTime(5_000);
    upstream.emit('response', response);
    vi.advanceTimersByTime(9_999);
    response.emit('data', Buffer.from('{'));
    expect(upstream.destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    await expect(result).rejects.toMatchObject({
      statusCode: 502, message: 'The selected server could not be reached.',
    });
    expect(upstream.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a normal RPC even before response headers arrive', async () => {
    const { upstream } = mockUpstream();
    const result = forwardRpcRequest(credentials, '{}');
    vi.advanceTimersByTime(6 * 60_000);
    await expect(result).rejects.toThrow('timed out');
    expect(upstream.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['idle timeout', 'request error', 'response error', 'premature close'])(
    'aborts and clears the deadline on %s',
    async (event) => {
      const { upstream, response } = mockUpstream();
      const result = forwardRpcRequest(credentials, '{}');
      upstream.emit('response', response);
      response.emit('data', Buffer.from('{'));
      const error = new Error('synthetic transport failure');
      if (event === 'idle timeout') {
        expect(upstream.setTimeout).toHaveBeenCalledWith(5 * 60_000, expect.any(Function));
        upstream.setTimeout.mock.calls[0][1]();
      } else if (event === 'request error') upstream.emit('error', error);
      else if (event === 'response error') response.emit('error', error);
      else response.emit('close');
      response.emit('close');

      await expect(result).rejects.toThrow();
      expect(upstream.destroy).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
