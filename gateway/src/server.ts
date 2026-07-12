import Fastify, { FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';

interface GatewayServerOptions {
  logger?: boolean;
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

  server.get('/healthz', async () => ({ status: 'ok' }));

  return server;
};

export const startGatewayServer = async (): Promise<void> => {
  const server = buildGatewayServer({ logger: true });
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
