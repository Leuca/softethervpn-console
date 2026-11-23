import { FastifyPluginAsync } from 'fastify';
import { LoginProbe, LoginProbeError } from './loginProbe.js';
import { LoginRateLimiter } from './loginRateLimit.js';
import { SESSION_COOKIE } from './sessionCookie.js';
import { LoginCredentials, SessionStore } from './sessions.js';
import { UpstreamResolutionError, UpstreamResolver } from './upstreamResolution.js';

const cookieOptions = (id: string) => ({
  httpOnly: true,
  path: `/api/connections/${id}`,
  sameSite: 'strict' as const,
  secure: 'auto' as const,
});

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

      const { owner, id } = options.sessions.create(credentials);
      reply.setCookie(SESSION_COOKIE, owner, cookieOptions(id));

      return {
        authenticated: true,
        connectionId: id,
        host: credentials.host,
        port: credentials.port,
        hub: credentials.hub,
      };
    },
  );

  server.get<{ Params: { id: string } }>('/api/connections/:id/session', async (request) => {
    const { id } = request.params;
    const session = options.sessions.owned(request.cookies[SESSION_COOKIE], id);

    if (!session) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      connectionId: id,
      host: session.host,
      port: session.port,
      hub: session.hub,
    };
  });

  server.post<{ Params: { id: string } }>('/api/connections/:id/logout', async (request, reply) => {
    const { id } = request.params;
    if (options.sessions.owned(request.cookies[SESSION_COOKIE], id)) {
      options.sessions.delete(id);
      reply.clearCookie(SESSION_COOKIE, cookieOptions(id));
    }

    return reply.code(204).send();
  });
};
