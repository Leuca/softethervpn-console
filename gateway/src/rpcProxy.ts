import { request as httpsRequest, RequestOptions } from 'node:https';
import { FastifyPluginAsync } from 'fastify';
import { SESSION_COOKIE } from './sessionCookie.js';
import { SessionCredentials, SessionStore } from './sessions.js';

const RPC_TIMEOUT_MS = 5 * 60 * 1000;

export interface RpcResponse {
  statusCode: number;
  contentType?: string;
  body: string;
}

export type RpcForwarder = (session: SessionCredentials, body: string) => Promise<RpcResponse>;

interface RpcProxyOptions {
  sessions: SessionStore;
  forward?: RpcForwarder;
}

export const buildRpcRequestOptions = (session: SessionCredentials, body: string): RequestOptions => ({
  hostname: session.host,
  port: session.port,
  path: '/api/',
  method: 'POST',
  rejectUnauthorized: !session.allowSelfSigned,
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-VPNADMIN-PASSWORD': session.password,
    ...(session.hub ? { 'X-VPNADMIN-HUBNAME': session.hub } : {}),
  },
});

export const forwardRpcRequest: RpcForwarder = (session, body) =>
  new Promise((resolve, reject) => {
    const upstream = httpsRequest(buildRpcRequestOptions(session, body), (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 502,
          contentType: typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
      response.on('error', reject);
    });

    upstream.setTimeout(RPC_TIMEOUT_MS, () => upstream.destroy(new Error('SoftEther JSON-RPC request timed out.')));
    upstream.on('error', reject);
    upstream.end(body);
  });

export const registerRpcProxy: FastifyPluginAsync<RpcProxyOptions> = async (server, options) => {
  const forward = options.forward ?? forwardRpcRequest;

  server.post<{ Body: unknown }>('/api/', async (request, reply) => {
    const id = request.cookies[SESSION_COOKIE];
    const session = id ? options.sessions.get(id) : undefined;

    if (!session) {
      return reply.code(401).send({ error: 'Authentication required.' });
    }

    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    if (body === undefined) {
      return reply.code(400).send({ error: 'A JSON-RPC request body is required.' });
    }

    try {
      const response = await forward(session, body);
      if (response.contentType) {
        reply.header('Content-Type', response.contentType);
      }
      return reply.code(response.statusCode).send(response.body);
    } catch {
      return reply.code(502).send({ error: 'Unable to reach the selected SoftEther VPN Server.' });
    }
  });
};
