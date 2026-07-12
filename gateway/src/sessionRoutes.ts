import { FastifyPluginAsync } from 'fastify';
import { SessionCredentials, SessionStore } from './sessions.js';

export const SESSION_COOKIE = 'softether_console_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/',
  sameSite: 'strict' as const,
};

interface SessionRoutesOptions {
  sessions: SessionStore;
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

export const registerSessionRoutes: FastifyPluginAsync<SessionRoutesOptions> = async (server, options) => {
  server.post<{ Body: SessionCredentials }>('/login', { schema: { body: loginBodySchema } }, async (request, reply) => {
    const credentials = {
      ...request.body,
      host: request.body.host.trim(),
      hub: request.body.hub.trim(),
    };

    if (!credentials.host) {
      return reply.code(400).send({ error: 'Server host is required.' });
    }

    const id = options.sessions.create(credentials);
    reply.setCookie(SESSION_COOKIE, id, COOKIE_OPTIONS);

    return {
      authenticated: true,
      host: credentials.host,
      port: credentials.port,
      hub: credentials.hub,
    };
  });

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
