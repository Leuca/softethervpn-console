import { describe, expect, it } from 'vitest';
import { buildGatewayServer, parsePort, parseTrustProxy } from './server.js';

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
});
