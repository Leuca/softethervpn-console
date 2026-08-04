import { describe, expect, it, vi } from 'vitest';
import { buildGatewayServer } from './server.js';
import { buildRpcRequestOptions } from './rpcProxy.js';
import { GatewaySession } from './sessions.js';
import { UpstreamResolver } from './upstreamResolution.js';

const loginPayload = {
  host: 'vpn.example.com',
  port: 443,
  hub: '',
  password: 'secret',
  allowSelfSigned: true,
};

const storedSession: GatewaySession = {
  ...loginPayload,
  resolvedAddresses: [
    { address: '192.0.2.10', family: 4 },
    { address: '2001:db8::10', family: 6 },
  ],
  expiresAt: Date.now() + 60_000,
};

const upstreamResolver = new UpstreamResolver(async () => [{ address: '192.0.2.10', family: 4 }]);

describe('gateway RPC proxy', () => {
  it('requires an authenticated session', async () => {
    const forward = vi.fn();
    const server = buildGatewayServer({
      loginProbe: vi.fn().mockResolvedValue(undefined),
      rpcForwarder: forward,
      upstreamResolver,
    });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/',
        payload: { jsonrpc: '2.0', method: 'Test', id: 1 },
      });

      expect(response.statusCode).toBe(401);
      expect(forward).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('forwards JSON-RPC through the server selected at login', async () => {
    const forward = vi.fn().mockResolvedValue({
      statusCode: 200,
      contentType: 'application/json',
      body: '{"jsonrpc":"2.0","result":{"value":1},"id":1}',
    });
    const server = buildGatewayServer({
      loginProbe: vi.fn().mockResolvedValue(undefined),
      rpcForwarder: forward,
      upstreamResolver,
    });

    try {
      const login = await server.inject({ method: 'POST', url: '/login', payload: loginPayload });
      const cookie = login.headers['set-cookie'] as string;
      const payload = JSON.stringify({ jsonrpc: '2.0', method: 'Test', params: {}, id: 1 });
      const response = await server.inject({
        method: 'POST',
        url: '/api/',
        headers: { cookie, 'content-type': 'text/plain' },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ jsonrpc: '2.0', result: { value: 1 }, id: 1 });
      expect(forward).toHaveBeenCalledWith(
        expect.objectContaining({
          ...loginPayload,
          resolvedAddresses: [{ address: '192.0.2.10', family: 4 }],
        }),
        payload,
      );
    } finally {
      await server.close();
    }
  });

  it('keeps the session available after a transient upstream failure', async () => {
    const forward = vi.fn().mockRejectedValue(new Error('connection failed'));
    const server = buildGatewayServer({
      loginProbe: vi.fn().mockResolvedValue(undefined),
      rpcForwarder: forward,
      upstreamResolver,
    });

    try {
      const login = await server.inject({ method: 'POST', url: '/login', payload: loginPayload });
      const cookie = login.headers['set-cookie'] as string;
      const failedRpc = await server.inject({
        method: 'POST',
        url: '/api/',
        headers: { cookie },
        payload: { jsonrpc: '2.0', method: 'Test', id: 1 },
      });
      const session = await server.inject({
        method: 'GET',
        url: '/session',
        headers: { cookie },
      });

      expect(failedRpc.statusCode).toBe(502);
      expect(session.json()).toEqual(login.json());
    } finally {
      await server.close();
    }
  });

  it('builds SoftEther authentication and TLS options without an empty hub header', () => {
    const options = buildRpcRequestOptions(storedSession, '{}');

    expect(options.agent).toBe(false);
    expect(options.rejectUnauthorized).toBe(false);
    expect(options.hostname).toBe(loginPayload.host);
    expect(options.headers).toMatchObject({
      'X-VPNADMIN-PASSWORD': loginPayload.password,
    });
    expect(options.headers).not.toHaveProperty('X-VPNADMIN-HUBNAME');
  });

  it('defers every pinned lookup completion until request setup has finished', async () => {
    const options = buildRpcRequestOptions(storedSession, '{}');
    const ipv4OnlyOptions = buildRpcRequestOptions(
      {
        ...storedSession,
        resolvedAddresses: [storedSession.resolvedAddresses[0]],
      },
      '{}',
    );
    const allCallback = vi.fn();
    const singleCallback = vi.fn();
    const missingFamilyCallback = vi.fn();

    options.lookup?.(loginPayload.host, { all: true }, allCallback);
    options.lookup?.(loginPayload.host, { all: false, family: 4 }, singleCallback);
    ipv4OnlyOptions.lookup?.(loginPayload.host, { all: false, family: 6 }, missingFamilyCallback);

    expect(allCallback).not.toHaveBeenCalled();
    expect(singleCallback).not.toHaveBeenCalled();
    expect(missingFamilyCallback).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(allCallback).toHaveBeenCalledWith(null, storedSession.resolvedAddresses);
    expect(singleCallback).toHaveBeenCalledWith(null, '192.0.2.10', 4);
    expect(missingFamilyCallback).toHaveBeenCalledWith(expect.any(Error), '', 0);
    expect(missingFamilyCallback.mock.calls[0][0]).toMatchObject({ code: 'ENOTFOUND' });
  });
});
