import { RpcForwarder } from './rpcProxy.js';
import { SessionCredentials } from './sessions.js';

const PROBE_VALUE = 42;
const PROBE_REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  method: 'Test',
  params: { IntValue_u32: PROBE_VALUE },
  id: 'login-probe',
});

interface ProbeResponse {
  error?: unknown;
  result?: unknown;
}

export type LoginProbe = (credentials: SessionCredentials) => Promise<void>;

export class LoginProbeError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 502,
  ) {
    super(message);
    this.name = 'LoginProbeError';
  }
}

export const createLoginProbe = (forward: RpcForwarder): LoginProbe => async (credentials) => {
  let response;
  try {
    response = await forward(credentials, PROBE_REQUEST);
  } catch {
    throw new LoginProbeError('The selected server could not be reached.', 502);
  }

  if (response.statusCode === 401 || response.statusCode === 403) {
    throw new LoginProbeError('The server did not accept these login details.', 401);
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new LoginProbeError('The selected server could not be reached.', 502);
  }

  let body: ProbeResponse;
  try {
    body = JSON.parse(response.body) as ProbeResponse;
  } catch {
    throw new LoginProbeError('The selected server did not return a valid response.', 502);
  }

  if (body.error) {
    throw new LoginProbeError('The server did not accept these login details.', 401);
  }
  if (!body.result || typeof body.result !== 'object') {
    throw new LoginProbeError('The selected server did not return a valid response.', 502);
  }
};
