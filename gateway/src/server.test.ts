import { describe, expect, it } from 'vitest';
import { buildGatewayServer } from './server.js';

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
