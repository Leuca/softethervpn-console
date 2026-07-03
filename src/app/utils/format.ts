import * as VPN from 'vpnrpc/dist/vpnrpc';

/**
 * Format a raw JSON-RPC field value for display. SoftEther's API suffixes field
 * names with their type (..._dt date, ..._u32/_u64 number, ..._bool boolean), which
 * lets us render each sensibly: dates as locale strings, numbers with thousands
 * separators (byte/packet counters run into the billions), booleans as Yes/No.
 */
export function formatRpcValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (key.endsWith('_dt') && (typeof value === 'string' || value instanceof Date)) {
    const date = new Date(value as string | Date);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

const connectionTypeLabels: Record<number, string> = {
  [VPN.VpnRpcConnectionType.Client]: 'VPN Client',
  [VPN.VpnRpcConnectionType.Init]: 'Initializing',
  [VPN.VpnRpcConnectionType.Login]: 'Login',
  [VPN.VpnRpcConnectionType.Additional]: 'Additional',
  [VPN.VpnRpcConnectionType.FarmRpc]: 'Server farm RPC',
  [VPN.VpnRpcConnectionType.AdminRpc]: 'Management RPC',
  [VPN.VpnRpcConnectionType.EnumHub]: 'Hub enumeration',
  [VPN.VpnRpcConnectionType.Password]: 'Password change',
  [VPN.VpnRpcConnectionType.SSTP]: 'SSTP',
  [VPN.VpnRpcConnectionType.OpenVPN]: 'OpenVPN',
};

/** Human-readable label for a VpnRpcConnectionType value. */
export function connectionTypeLabel(type: number): string {
  return connectionTypeLabels[type] ?? `Type ${type}`;
}

const hubTypeLabels: Record<number, string> = {
  [VPN.VpnRpcHubType.Standalone]: 'Standalone',
  [VPN.VpnRpcHubType.FarmStatic]: 'Static',
  [VPN.VpnRpcHubType.FarmDynamic]: 'Dynamic',
};

/** Human-readable label for a VpnRpcHubType value. */
export function hubTypeLabel(type: number): string {
  return hubTypeLabels[type] ?? `Type ${type}`;
}

const userAuthTypeLabels: Record<number, string> = {
  [VPN.VpnRpcUserAuthType.Anonymous]: 'Anonymous',
  [VPN.VpnRpcUserAuthType.Password]: 'Password',
  [VPN.VpnRpcUserAuthType.UserCert]: 'User certificate',
  [VPN.VpnRpcUserAuthType.RootCert]: 'Root certificate',
  [VPN.VpnRpcUserAuthType.Radius]: 'RADIUS',
  [VPN.VpnRpcUserAuthType.NTDomain]: 'NT domain',
};

/** Human-readable label for a VpnRpcUserAuthType value. */
export function userAuthTypeLabel(type: number): string {
  return userAuthTypeLabels[type] ?? `Type ${type}`;
}

/**
 * SoftEther represents "no expiry" / "never logged in" as a sentinel timestamp
 * around the Unix epoch. Render real dates as locale strings and the sentinel
 * as a caller-supplied placeholder.
 */
export function formatOptionalDate(value: unknown, placeholder = 'Never'): string {
  if (value === null || value === undefined) {
    return placeholder;
  }
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1970) {
    return placeholder;
  }
  return date.toLocaleString();
}
