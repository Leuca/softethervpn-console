import { describe, expect, it, vi } from 'vitest';
import { LoginProbeError } from './loginProbe.js';
import { LoginRateLimiter } from './loginRateLimit.js';
import { buildGatewayServer } from './server.js';
import { SessionStore } from './sessions.js';

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

  it('replaces the previous session after a successful login', async () => {
    const sessions = new SessionStore();
    const server = buildGatewayServer({
      loginProbe: vi.fn().mockResolvedValue(undefined),
      sessions,
    });

    try {
      const firstLogin = await server.inject({
        method: 'POST',
        url: '/login',
        payload: loginPayload,
      });
      const firstCookie = firstLogin.headers['set-cookie'] as string;
      const secondLogin = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { cookie: firstCookie },
        payload: loginPayload,
      });
      const secondCookie = secondLogin.headers['set-cookie'] as string;
      const previousSession = await server.inject({
        method: 'GET',
        url: '/session',
        headers: { cookie: firstCookie },
      });
      const currentSession = await server.inject({
        method: 'GET',
        url: '/session',
        headers: { cookie: secondCookie },
      });

      expect(secondCookie).not.toBe(firstCookie);
      expect(previousSession.json()).toEqual({ authenticated: false });
      expect(currentSession.json()).toEqual(secondLogin.json());
    } finally {
      await server.close();
    }
  });

  it('limits failed login probes per client and resets the window over time', async () => {
    let now = 0;
    const loginRateLimiter = new LoginRateLimiter({ now: () => now });
    const loginProbe = vi
      .fn()
      .mockRejectedValue(
        new LoginProbeError('The server did not accept these login details.', 401),
      );
    const server = buildGatewayServer({ loginProbe, loginRateLimiter });

    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await server.inject({
          method: 'POST',
          url: '/login',
          payload: loginPayload,
        });
        expect(response.statusCode).toBe(401);
      }

      const blocked = await server.inject({
        method: 'POST',
        url: '/login',
        payload: loginPayload,
      });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers['retry-after']).toBe('60');
      expect(loginProbe).toHaveBeenCalledTimes(10);

      now = 60_000;
      const retried = await server.inject({
        method: 'POST',
        url: '/login',
        payload: loginPayload,
      });
      expect(retried.statusCode).toBe(401);
      expect(loginProbe).toHaveBeenCalledTimes(11);
    } finally {
      await server.close();
    }
  });
});
