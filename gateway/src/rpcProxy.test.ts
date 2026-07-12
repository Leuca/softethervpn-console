import { describe, expect, it, vi } from 'vitest';
import { buildGatewayServer } from './server.js';
import { buildRpcRequestOptions } from './rpcProxy.js';
import { GatewaySession } from './sessions.js';

const loginPayload = {
  host: 'vpn.example.com',
  port: 443,
  hub: '',
  password: 'secret',
  allowSelfSigned: true,
};

const storedSession: GatewaySession = {
  ...loginPayload,
  expiresAt: Date.now() + 60_000,
};

describe('gateway RPC proxy', () => {
  it('requires an authenticated session', async () => {
    const forward = vi.fn();
    const server = buildGatewayServer({
      loginProbe: vi.fn().mockResolvedValue(undefined),
      rpcForwarder: forward,
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
      expect(forward).toHaveBeenCalledWith(expect.objectContaining(loginPayload), payload);
    } finally {
      await server.close();
    }
  });

  it('builds SoftEther authentication and TLS options without an empty hub header', () => {
    const options = buildRpcRequestOptions(storedSession, '{}');

    expect(options.rejectUnauthorized).toBe(false);
    expect(options.headers).toMatchObject({
      'X-VPNADMIN-PASSWORD': loginPayload.password,
    });
    expect(options.headers).not.toHaveProperty('X-VPNADMIN-HUBNAME');
  });
});
