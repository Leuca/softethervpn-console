import staticFiles from '@fastify/static';
import { FastifyInstance, FastifyRequest } from 'fastify';

const RESERVED_PATHS = new Set(['/healthz', '/login', '/logout', '/session']);

const isFrontendNavigation = (request: FastifyRequest): boolean => {
  const pathname = request.url.split('?', 1)[0];
  const acceptsHtml = request.headers.accept?.includes('text/html') ?? false;
  const reserved = RESERVED_PATHS.has(pathname) || pathname === '/api' || pathname.startsWith('/api/');

  return request.method === 'GET' && acceptsHtml && !reserved;
};

export const registerFrontend = (server: FastifyInstance, root: string): void => {
  server.register(staticFiles, { root });
  server.setNotFoundHandler((request, reply) => {
    if (isFrontendNavigation(request)) {
      return reply.sendFile('index.html');
    }

    return reply.code(404).send({ error: 'Not found.' });
  });
};
