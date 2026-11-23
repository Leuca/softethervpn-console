import { RequestOptions, request as httpsRequest } from 'node:https';
import { LookupFunction } from 'node:net';
import { FastifyPluginAsync } from 'fastify';
import { SESSION_COOKIE } from './sessionCookie.js';
import { SessionCredentials, SessionStore } from './sessions.js';

const RPC_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const RPC_BUDGET = { maxBytes: 16 * 1024 * 1024, deadlineMs: 6 * 60 * 1000 };

export interface RpcResponse {
  statusCode: number;
  contentType?: string;
  body: string;
}

export type RpcForwarder = (
  session: SessionCredentials,
  body: string,
  budget?: typeof RPC_BUDGET,
) => Promise<RpcResponse>;

interface RpcProxyOptions {
  sessions: SessionStore;
  forward?: RpcForwarder;
}

const createPinnedLookup =
  (session: SessionCredentials): LookupFunction =>
  (_hostname, options, callback) => {
    const addresses = options.family
      ? session.resolvedAddresses.filter(({ family }) => family === options.family)
      : session.resolvedAddresses;

    if (addresses.length === 0) {
      const error = Object.assign(new Error('No pinned address matches the requested family.'), {
        code: 'ENOTFOUND',
      });
      process.nextTick(() => callback(error, '', 0));
      return;
    }

    if (options.all) {
      process.nextTick(() => callback(null, addresses));
      return;
    }

    process.nextTick(() => callback(null, addresses[0].address, addresses[0].family));
  };

export const buildRpcRequestOptions = (
  session: SessionCredentials,
  body: string,
): RequestOptions => ({
  agent: false,
  hostname: session.host,
  lookup: createPinnedLookup(session),
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

export const forwardRpcRequest: RpcForwarder = (session, body, budget = RPC_BUDGET) =>
  new Promise((resolve, reject) => {
    const upstream = httpsRequest(buildRpcRequestOptions(session, body));
    const chunks: Buffer[] = [];
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      chunks.length = 0;
      upstream.destroy();
      reject(error);
    };
    const timedOut = () => fail(new Error('SoftEther JSON-RPC request timed out.'));
    const deadline = setTimeout(timedOut, budget.deadlineMs);

    upstream.on('error', fail);
    upstream.setTimeout(RPC_IDLE_TIMEOUT_MS, timedOut);
    upstream.once('response', (response) => {
      let bytes = 0;
      response.on('error', fail);
      response.once('close', () => {
        if (!settled) fail(new Error('SoftEther JSON-RPC response closed early.'));
      });
      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        bytes += chunk.byteLength;
        if (bytes > budget.maxBytes) {
          fail(new Error('SoftEther JSON-RPC response too large.'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        resolve({
          statusCode: response.statusCode ?? 502,
          contentType:
            typeof response.headers['content-type'] === 'string'
              ? response.headers['content-type']
              : undefined,
          body: Buffer.concat(chunks, bytes).toString('utf8'),
        });
      });
    });

    upstream.end(body);
  });

export const registerRpcProxy: FastifyPluginAsync<RpcProxyOptions> = async (server, options) => {
  const forward = options.forward ?? forwardRpcRequest;

  server.post<{ Body: unknown; Params: { id: string } }>(
    '/api/connections/:id/rpc',
    async (request, reply) => {
      const session = options.sessions.owned(request.cookies[SESSION_COOKIE], request.params.id);

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
        return reply
          .code(502)
          .send({ error: 'Unable to reach the selected SoftEther VPN Server.' });
      }
    },
  );
};
