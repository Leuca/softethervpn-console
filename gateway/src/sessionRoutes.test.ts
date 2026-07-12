import { describe, expect, it, vi } from 'vitest';
import { buildGatewayServer } from './server.js';

const loginPayload = {
  host: 'vpn.example.com',
  port: 443,
  hub: 'DEFAULT',
  password: 'secret',
  allowSelfSigned: false,
};

describe('gateway session routes', () => {
  it('creates a private session and returns only public server details', async () => {
    const server = buildGatewayServer({
      loginProbe: vi.fn().mockResolvedValue(undefined),
      trustProxy: true,
    });

    try {
      const login = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { 'x-forwarded-proto': 'https' },
        payload: loginPayload,
      });
      const cookie = login.headers['set-cookie'];

      expect(login.statusCode).toBe(200);
      expect(login.json()).toEqual({
        authenticated: true,
        host: loginPayload.host,
        port: loginPayload.port,
        hub: loginPayload.hub,
      });
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Secure');
      expect(login.body).not.toContain(loginPayload.password);

      const session = await server.inject({
        method: 'GET',
        url: '/session',
        headers: { cookie: cookie as string },
      });

      expect(session.json()).toEqual(login.json());
      expect(session.body).not.toContain(loginPayload.password);
    } finally {
      await server.close();
    }
  });

  it('deletes the session during logout', async () => {
    const server = buildGatewayServer({ loginProbe: vi.fn().mockResolvedValue(undefined) });

    try {
      const login = await server.inject({
        method: 'POST',
        url: '/login',
        payload: loginPayload,
      });
      const cookie = login.headers['set-cookie'] as string;
      const logout = await server.inject({
        method: 'POST',
        url: '/logout',
        headers: { cookie },
      });
      const session = await server.inject({
        method: 'GET',
        url: '/session',
        headers: { cookie },
      });

      expect(logout.statusCode).toBe(204);
      expect(session.json()).toEqual({ authenticated: false });
    } finally {
      await server.close();
    }
  });
});
