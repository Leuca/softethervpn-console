import { describe, expect, it, vi } from 'vitest';
import { LoginProbeError, createLoginProbe } from './loginProbe.js';

const credentials = {
  host: 'vpn.example.com',
  port: 443,
  hub: '',
  password: 'secret',
  allowSelfSigned: false,
};

describe('SoftEther login probe', () => {
  it('accepts a successful SoftEther Test response', async () => {
    const forward = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: '{"jsonrpc":"2.0","result":{"IntValue_u32":42},"id":"login-probe"}',
    });

    await expect(createLoginProbe(forward)(credentials)).resolves.toBeUndefined();
    expect(forward).toHaveBeenCalledWith(
      credentials,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'Test',
        params: { IntValue_u32: 42 },
        id: 'login-probe',
      }),
    );
  });

  it('normalizes a SoftEther JSON-RPC error as rejected login details', async () => {
    const rejected = createLoginProbe(
      vi.fn().mockResolvedValue({
        statusCode: 200,
        body: '{"jsonrpc":"2.0","error":{"code":-32603,"message":"Authentication failed"},"id":"login-probe"}',
      }),
    )(credentials);

    await expect(rejected).rejects.toEqual(
      new LoginProbeError('The server did not accept these login details.', 401),
    );
  });

  it('distinguishes rejected credentials from an unreachable server', async () => {
    const rejected = createLoginProbe(
      vi.fn().mockResolvedValue({ statusCode: 403, body: '' }),
    )(credentials);
    const unreachable = createLoginProbe(vi.fn().mockRejectedValue(new Error('connect failed')))(credentials);

    await expect(rejected).rejects.toEqual(
      new LoginProbeError('The server did not accept these login details.', 401),
    );
    await expect(unreachable).rejects.toEqual(
      new LoginProbeError('The selected server could not be reached.', 502),
    );
  });

  it('reports upstream certificate verification failures clearly', async () => {
    const certificateError = Object.assign(new Error('certificate rejected'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    });
    const probe = createLoginProbe(vi.fn().mockRejectedValue(certificateError));

    await expect(probe(credentials)).rejects.toEqual(
      new LoginProbeError(
        'The server certificate could not be verified. Check the server address and certificate, or allow self-signed certificates for a trusted private server.',
        502,
      ),
    );
  });
});
