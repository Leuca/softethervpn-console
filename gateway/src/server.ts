import cookie from '@fastify/cookie';
import Fastify, { FastifyInstance } from 'fastify';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerFrontend } from './frontend.js';
import { createLoginProbe, LoginProbe } from './loginProbe.js';
import { forwardRpcRequest, registerRpcProxy, RpcForwarder } from './rpcProxy.js';
import { registerSessionRoutes } from './sessionRoutes.js';
import { SessionStore } from './sessions.js';

interface GatewayServerOptions {
  frontendRoot?: string;
  loginProbe?: LoginProbe;
  logger?: boolean;
  rpcForwarder?: RpcForwarder;
  sessions?: SessionStore;
}

const parsePort = (value: string | undefined): number => {
  const port = Number(value || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
};

export const buildGatewayServer = (options: GatewayServerOptions = {}): FastifyInstance => {
  const server = Fastify({ logger: options.logger ?? false });
  const sessions = options.sessions ?? new SessionStore();
  const rpcForwarder = options.rpcForwarder ?? forwardRpcRequest;

  server.get('/healthz', async () => ({ status: 'ok' }));
  server.register(cookie);
  server.register(registerSessionRoutes, {
    sessions,
    probe: options.loginProbe ?? createLoginProbe(rpcForwarder),
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
  const frontendRoot = process.env.FRONTEND_ROOT || fileURLToPath(new URL('../../dist', import.meta.url));
  const server = buildGatewayServer({ frontendRoot, logger: true });
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
