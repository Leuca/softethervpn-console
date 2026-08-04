import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { LoginCredentials, ResolvedAddress, SessionCredentials } from './sessions.js';

const HOSTNAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export type UpstreamHostResolver = (host: string) => Promise<ResolvedAddress[]>;

export class UpstreamResolutionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 502,
  ) {
    super(message);
    this.name = 'UpstreamResolutionError';
  }
}

const canonicalizeIpv6 = (value: string, decodeUriScope: boolean): string => {
  const scopeSeparator = value.indexOf('%');
  const address = scopeSeparator === -1 ? value : value.slice(0, scopeSeparator);
  const suppliedScope = scopeSeparator === -1 ? '' : value.slice(scopeSeparator + 1);
  const scope =
    decodeUriScope && suppliedScope.startsWith('25') && suppliedScope.length > 2
      ? suppliedScope.slice(2)
      : suppliedScope;
  const canonicalAddress = new URL(`http://[${address}]/`).hostname.slice(1, -1);

  if (!scope) {
    return canonicalAddress;
  }
  if (!/^[a-z0-9_.-]+$/i.test(scope)) {
    throw new Error('IPv6 scope identifiers contain unsupported characters.');
  }
  return `${canonicalAddress}%${scope}`;
};

const normalizeHost = (value: string): string => {
  let host = value.trim();
  const bracketed = host.startsWith('[') && host.endsWith(']');
  if (bracketed) {
    host = host.slice(1, -1);
  }

  const addressFamily = isIP(host);
  if (addressFamily === 4) {
    return host;
  }
  if (addressFamily === 6) {
    return canonicalizeIpv6(host, bracketed);
  }

  const isAbsolute = host.endsWith('.');
  const dnsHost = isAbsolute ? host.slice(0, -1) : host;
  if (dnsHost.length === 0 || dnsHost.length > 253 || !HOSTNAME_PATTERN.test(dnsHost)) {
    throw new Error('Upstream hosts must be IP addresses or valid DNS names.');
  }

  return `${dnsHost.toLowerCase()}${isAbsolute ? '.' : ''}`;
};

const defaultResolver: UpstreamHostResolver = async (host) => {
  const addresses = await lookup(host, { all: true });
  return addresses.flatMap(({ address, family }) =>
    family === 4 || family === 6 ? [{ address, family }] : [],
  );
};

export class UpstreamResolver {
  constructor(private readonly resolver: UpstreamHostResolver = defaultResolver) {}

  async resolve(credentials: LoginCredentials): Promise<SessionCredentials> {
    let resolutionHost: string;
    try {
      resolutionHost = normalizeHost(credentials.host);
    } catch {
      throw new UpstreamResolutionError(
        'Server host must be an IP address or valid DNS name.',
        400,
      );
    }

    const host = resolutionHost.endsWith('.') ? resolutionHost.slice(0, -1) : resolutionHost;
    let addresses: ResolvedAddress[];
    const addressFamily = isIP(host);
    if (addressFamily === 4 || addressFamily === 6) {
      addresses = [{ address: host, family: addressFamily }];
    } else {
      try {
        addresses = await this.resolver(resolutionHost);
      } catch {
        throw new UpstreamResolutionError(
          'The selected server address could not be resolved.',
          502,
        );
      }
    }

    const normalizedAddresses = addresses.flatMap(({ address, family }) => {
      if (isIP(address) !== family) {
        return [];
      }
      return [{ address: normalizeHost(address), family }];
    });
    const uniqueAddresses = Array.from(
      new Map(
        normalizedAddresses.map((address) => [`${address.family}:${address.address}`, address]),
      ).values(),
    );
    if (uniqueAddresses.length === 0) {
      throw new UpstreamResolutionError('The selected server address could not be resolved.', 502);
    }

    return { ...credentials, host, resolvedAddresses: uniqueAddresses };
  }
}
