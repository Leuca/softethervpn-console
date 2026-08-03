import { describe, expect, it } from 'vitest';
import {
  REQUEST_BODY_LIMIT_BYTES,
  buildGatewayServer,
  parsePort,
  parseTrustProxy,
} from './server.js';

describe('gateway configuration', () => {
  it('parses the listen port and rejects invalid values', () => {
    expect(parsePort(undefined)).toBe(8080);
    expect(parsePort('8443')).toBe(8443);
    expect(() => parsePort('0')).toThrow('PORT must be an integer between 1 and 65535.');
    expect(() => parsePort('65536')).toThrow('PORT must be an integer between 1 and 65535.');
    expect(() => parsePort('1.5')).toThrow('PORT must be an integer between 1 and 65535.');
  });

  it('parses trusted proxy addresses and CIDRs', () => {
    expect(parseTrustProxy(undefined)).toBe('127.0.0.1');
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('127.0.0.1')).toBe('127.0.0.1');
    expect(parseTrustProxy('127.0.0.1, 10.0.0.0/8')).toEqual(['127.0.0.1', '10.0.0.0/8']);
    expect(() => buildGatewayServer({ trustProxy: parseTrustProxy('not-an-address') })).toThrow();
  });
});

describe('gateway server', () => {
  it('reports health without binding a network port', async () => {
    const server = buildGatewayServer();

    try {
      const response = await server.inject({ method: 'GET', url: '/healthz' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      await server.close();
    }
  });

  it('rejects cross-origin writes while accepting the trusted public origin', async () => {
    const server = buildGatewayServer({ trustProxy: true });

    try {
      const rejected = await server.inject({
        method: 'POST',
        url: '/logout',
        headers: {
          host: '127.0.0.1:8080',
          origin: 'https://attacker.example.com',
          'x-forwarded-host': 'console.example.com:8443',
          'x-forwarded-proto': 'https',
        },
      });
      const accepted = await server.inject({
        method: 'POST',
        url: '/logout',
        headers: {
          host: '127.0.0.1:8080',
          origin: 'https://console.example.com:8443',
          'x-forwarded-host': 'console.example.com:8443',
          'x-forwarded-proto': 'https',
        },
      });

      expect(rejected.statusCode).toBe(403);
      expect(rejected.json()).toEqual({ error: 'Cross-origin requests are not allowed.' });
      expect(accepted.statusCode).toBe(204);
    } finally {
      await server.close();
    }
  });

  it('rejects request bodies larger than one MiB', async () => {
    const server = buildGatewayServer();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/login',
        payload: {
          host: 'vpn.example.com',
          port: 443,
          hub: '',
          password: 'x'.repeat(REQUEST_BODY_LIMIT_BYTES),
          allowSelfSigned: false,
        },
      });

      expect(response.statusCode).toBe(413);
    } finally {
      await server.close();
    }
  });
});
