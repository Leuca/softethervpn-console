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
