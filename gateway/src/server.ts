import cookie from '@fastify/cookie';
import Fastify, { FastifyInstance, FastifyRequest, FastifyServerOptions } from 'fastify';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerFrontend } from './frontend.js';
import { LoginProbe, createLoginProbe } from './loginProbe.js';
import { LoginRateLimiter } from './loginRateLimit.js';
import { RpcForwarder, forwardRpcRequest, registerRpcProxy } from './rpcProxy.js';
import { registerSessionRoutes } from './sessionRoutes.js';
import { SessionStore } from './sessions.js';
import { UpstreamResolver } from './upstreamResolution.js';

interface GatewayServerOptions {
  frontendRoot?: string;
  loginProbe?: LoginProbe;
  loginRateLimiter?: LoginRateLimiter;
  logger?: FastifyServerOptions['logger'];
  rpcForwarder?: RpcForwarder;
  sessions?: SessionStore;
  trustProxy?: FastifyServerOptions['trustProxy'];
  upstreamResolver?: UpstreamResolver;
}

export const REQUEST_BODY_LIMIT_BYTES = 1024 * 1024;

export const GATEWAY_LOGGER_OPTIONS = {
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-vpnadmin-password"]',
      'req.body.password',
      'body.password',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const hasAllowedOrigin = (request: FastifyRequest): boolean => {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  const host = request.host;
  if (!host) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(`${request.protocol}://${host}`).origin;
  } catch {
    return false;
  }
};

export const parsePort = (value: string | undefined): number => {
  const port = Number(value || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
};

export const parseTrustProxy = (value: string | undefined): FastifyServerOptions['trustProxy'] => {
  const configuredValue = value?.trim();
  if (!configuredValue) {
    return '127.0.0.1';
  }
  if (configuredValue === 'true') {
    return true;
  }

  const proxies = configuredValue
    .split(',')
    .map((proxy) => proxy.trim())
    .filter(Boolean);

  if (proxies.length === 0) {
    throw new Error(
      'TRUST_PROXY must be "true" or a comma-separated list of proxy addresses or CIDRs.',
    );
  }

  return proxies.length === 1 ? proxies[0] : proxies;
};

export const buildGatewayServer = (options: GatewayServerOptions = {}): FastifyInstance => {
  const server = Fastify({
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
  });
  const sessions = options.sessions ?? new SessionStore();
  const rpcForwarder = options.rpcForwarder ?? forwardRpcRequest;
  const upstreamResolver = options.upstreamResolver ?? new UpstreamResolver();

  server.addHook('onClose', async () => {
    sessions.clear();
  });

  server.addHook('onRequest', async (request, reply) => {
    if (!SAFE_METHODS.has(request.method) && !hasAllowedOrigin(request)) {
      return reply.code(403).send({ error: 'Cross-origin requests are not allowed.' });
    }
  });

  server.get('/healthz', async () => ({ status: 'ok' }));
  server.register(cookie);
  server.register(registerSessionRoutes, {
    loginRateLimiter: options.loginRateLimiter,
    sessions,
    probe: options.loginProbe ?? createLoginProbe(rpcForwarder),
    upstreamResolver,
  });
  server.register(registerRpcProxy, {
    sessions,
    forward: rpcForwarder,
  });
  if (options.frontendRoot) {
    registerFrontend(server, options.frontendRoot);
  }

  return server;
};

export const startGatewayServer = async (): Promise<void> => {
  const frontendRoot =
    process.env.FRONTEND_ROOT || fileURLToPath(new URL('../../dist', import.meta.url));
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  const server = buildGatewayServer({
    frontendRoot,
    logger: GATEWAY_LOGGER_OPTIONS,
    trustProxy,
  });
  const host = process.env.HOST || '127.0.0.1';
  const port = parsePort(process.env.PORT);

  await server.listen({ host, port });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startGatewayServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
