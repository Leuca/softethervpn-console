import { FastifyPluginAsync } from 'fastify';
import { LoginProbe, LoginProbeError } from './loginProbe.js';
import { LoginRateLimiter } from './loginRateLimit.js';
import { SESSION_COOKIE } from './sessionCookie.js';
import { LoginCredentials, SessionStore } from './sessions.js';
import { UpstreamResolutionError, UpstreamResolver } from './upstreamResolution.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/',
  sameSite: 'strict' as const,
  secure: 'auto' as const,
};

interface SessionRoutesOptions {
  loginRateLimiter?: LoginRateLimiter;
  probe: LoginProbe;
  sessions: SessionStore;
  upstreamResolver: UpstreamResolver;
}

const loginBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['host', 'port', 'hub', 'password', 'allowSelfSigned'],
  properties: {
    host: { type: 'string', minLength: 1 },
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    hub: { type: 'string' },
    password: { type: 'string', minLength: 1 },
    allowSelfSigned: { type: 'boolean' },
  },
} as const;

export const registerSessionRoutes: FastifyPluginAsync<SessionRoutesOptions> = async (
  server,
  options,
) => {
  const loginRateLimiter = options.loginRateLimiter ?? new LoginRateLimiter();

  server.post<{ Body: LoginCredentials }>(
    '/login',
    { schema: { body: loginBodySchema } },
    async (request, reply) => {
      const retryAfter = loginRateLimiter.retryAfterSeconds(request.ip);
      if (retryAfter !== undefined) {
        return reply
          .header('Retry-After', String(retryAfter))
          .code(429)
          .send({ error: 'Too many login attempts. Try again later.' });
      }

      const loginCredentials = {
        ...request.body,
        host: request.body.host.trim(),
        hub: request.body.hub.trim(),
      };

      if (!loginCredentials.host) {
        return reply.code(400).send({ error: 'Server host is required.' });
      }

      loginRateLimiter.recordAttempt(request.ip);
      let credentials;
      try {
        credentials = await options.upstreamResolver.resolve(loginCredentials);
      } catch (error) {
        if (error instanceof UpstreamResolutionError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply
          .code(502)
          .send({ error: 'The selected server address could not be resolved.' });
      }

      try {
        await options.probe(credentials);
      } catch (error) {
        if (error instanceof LoginProbeError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        return reply.code(502).send({ error: 'The selected server could not be reached.' });
      }

      const previousId = request.cookies[SESSION_COOKIE];
      if (previousId) {
        options.sessions.delete(previousId);
      }
      const id = options.sessions.create(credentials);
      reply.setCookie(SESSION_COOKIE, id, COOKIE_OPTIONS);

      return {
        authenticated: true,
        host: credentials.host,
        port: credentials.port,
        hub: credentials.hub,
      };
    },
  );

  server.get('/session', async (request, reply) => {
    const id = request.cookies[SESSION_COOKIE];
    const session = id ? options.sessions.get(id) : undefined;

    if (!session) {
      if (id) {
        reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
      }
      return { authenticated: false };
    }

    return {
      authenticated: true,
      host: session.host,
      port: session.port,
      hub: session.hub,
    };
  });

  server.post('/logout', async (request, reply) => {
    const id = request.cookies[SESSION_COOKIE];
    if (id) {
      options.sessions.delete(id);
    }

    reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return reply.code(204).send();
  });
};
