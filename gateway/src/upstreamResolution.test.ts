import { describe, expect, it, vi } from 'vitest';
import { UpstreamResolutionError, UpstreamResolver } from './upstreamResolution.js';

const credentials = {
  host: 'vpn.example.com',
  port: 443,
  hub: '',
  password: 'secret',
  allowSelfSigned: false,
};

describe('upstream resolution', () => {
  it('normalizes a hostname and pins all initial DNS results', async () => {
    const resolver = vi.fn().mockResolvedValue([
      { address: '192.0.2.10', family: 4 },
      { address: '2001:0db8:0:0:0:0:0:10', family: 6 },
    ]);
    const upstreamResolver = new UpstreamResolver(resolver);

    await expect(
      upstreamResolver.resolve({ ...credentials, host: 'VPN.Example.COM.' }),
    ).resolves.toEqual({
      ...credentials,
      host: 'vpn.example.com',
      resolvedAddresses: [
        { address: '192.0.2.10', family: 4 },
        { address: '2001:db8::10', family: 6 },
      ],
    });
    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith('vpn.example.com.');
  });

  it('pins IPv4 and canonical IPv6 literals without consulting DNS', async () => {
    const resolver = vi.fn();
    const upstreamResolver = new UpstreamResolver(resolver);

    await expect(
      upstreamResolver.resolve({ ...credentials, host: '127.0.0.1' }),
    ).resolves.toMatchObject({
      host: '127.0.0.1',
      resolvedAddresses: [{ address: '127.0.0.1', family: 4 }],
    });
    await expect(
      upstreamResolver.resolve({ ...credentials, host: '[2001:0db8:0:0:0:0:0:10]' }),
    ).resolves.toMatchObject({
      host: '2001:db8::10',
      resolvedAddresses: [{ address: '2001:db8::10', family: 6 }],
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('preserves a scoped IPv6 destination while decoding URL-style scope syntax', async () => {
    const upstreamResolver = new UpstreamResolver(vi.fn());

    await expect(
      upstreamResolver.resolve({ ...credentials, host: '[fe80::1%25eth0]' }),
    ).resolves.toMatchObject({
      host: 'fe80::1%eth0',
      resolvedAddresses: [{ address: 'fe80::1%eth0', family: 6 }],
    });
    await expect(
      upstreamResolver.resolve({ ...credentials, host: 'fe80::1%25' }),
    ).resolves.toMatchObject({
      host: 'fe80::1%25',
      resolvedAddresses: [{ address: 'fe80::1%25', family: 6 }],
    });
    await expect(
      upstreamResolver.resolve({ ...credentials, host: 'fe80::1%25eth0' }),
    ).resolves.toMatchObject({
      host: 'fe80::1%25eth0',
      resolvedAddresses: [{ address: 'fe80::1%25eth0', family: 6 }],
    });
    await expect(
      upstreamResolver.resolve({ ...credentials, host: '[fe80::1%2525eth0]' }),
    ).resolves.toMatchObject({
      host: 'fe80::1%25eth0',
      resolvedAddresses: [{ address: 'fe80::1%25eth0', family: 6 }],
    });
  });

  it('rejects invalid host syntax before DNS resolution', async () => {
    const resolver = vi.fn();
    const upstreamResolver = new UpstreamResolver(resolver);

    await expect(
      upstreamResolver.resolve({ ...credentials, host: 'https://vpn.example.com' }),
    ).rejects.toEqual(
      new UpstreamResolutionError('Server host must be an IP address or valid DNS name.', 400),
    );
    expect(resolver).not.toHaveBeenCalled();
  });
});
