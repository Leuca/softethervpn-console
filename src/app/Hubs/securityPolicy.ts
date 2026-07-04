// Security policy metadata for the per-user / per-group policy editor. Labels
// mirror the native Server Manager (strtable POL_0..POL_37); the keys are the
// inline "policy:*" fields carried by VpnRpcSetUser and VpnRpcSetGroup, guarded
// by UsePolicy_bool. SoftEther has no hub-level policy - policy is per subject.

export type PolicyGroup = 'access' | 'limits' | 'bandwidth' | 'ipv4' | 'ipv6';

export interface PolicyField {
  key: string; // e.g. "policy:Access_bool"
  label: string;
  kind: 'bool' | 'int';
  group: PolicyGroup;
  unit?: string; // hint shown next to integer fields
}

export const POLICY_GROUPS: { id: PolicyGroup; title: string }[] = [
  { id: 'access', title: 'Access and security' },
  { id: 'limits', title: 'Connection limits' },
  { id: 'bandwidth', title: 'Bandwidth' },
  { id: 'ipv4', title: 'IPv4 filtering' },
  { id: 'ipv6', title: 'IPv6 filtering' },
];

export const POLICY_FIELDS: PolicyField[] = [
  // Access and security
  { key: 'policy:Access_bool', label: 'Allow access', kind: 'bool', group: 'access' },
  { key: 'policy:NoBridge_bool', label: 'Deny bridge operation', kind: 'bool', group: 'access' },
  { key: 'policy:NoRouting_bool', label: 'Deny routing operation (IPv4)', kind: 'bool', group: 'access' },
  { key: 'policy:NoServer_bool', label: 'Deny operation as TCP/IP server (IPv4)', kind: 'bool', group: 'access' },
  { key: 'policy:MonitorPort_bool', label: 'Allow monitoring mode', kind: 'bool', group: 'access' },
  { key: 'policy:FixPassword_bool', label: 'Deny changing password', kind: 'bool', group: 'access' },
  { key: 'policy:NoQoS_bool', label: 'Deny VoIP / QoS function', kind: 'bool', group: 'access' },
  { key: 'policy:NoSavePassword_bool', label: 'Disallow password save in VPN Client', kind: 'bool', group: 'access' },

  // Connection limits
  { key: 'policy:MaxConnection_u32', label: 'Maximum number of TCP connections', kind: 'int', group: 'limits' },
  { key: 'policy:TimeOut_u32', label: 'Time-out period', kind: 'int', group: 'limits', unit: 'seconds' },
  { key: 'policy:MultiLogins_u32', label: 'Maximum number of multiple logins', kind: 'int', group: 'limits' },
  {
    key: 'policy:AutoDisconnect_u32',
    label: 'VPN Client automatic disconnect',
    kind: 'int',
    group: 'limits',
    unit: 'seconds (0 = disabled)',
  },

  // Bandwidth
  { key: 'policy:MaxUpload_u32', label: 'Upload bandwidth', kind: 'int', group: 'bandwidth', unit: 'bps (0 = unlimited)' },
  {
    key: 'policy:MaxDownload_u32',
    label: 'Download bandwidth',
    kind: 'int',
    group: 'bandwidth',
    unit: 'bps (0 = unlimited)',
  },

  // IPv4 filtering
  { key: 'policy:DHCPFilter_bool', label: 'Filter DHCP packets (IPv4)', kind: 'bool', group: 'ipv4' },
  { key: 'policy:DHCPNoServer_bool', label: 'Disallow DHCP server operation (IPv4)', kind: 'bool', group: 'ipv4' },
  { key: 'policy:DHCPForce_bool', label: 'Enforce DHCP allocated IP addresses (IPv4)', kind: 'bool', group: 'ipv4' },
  { key: 'policy:CheckMac_bool', label: 'Deny MAC address duplication', kind: 'bool', group: 'ipv4' },
  { key: 'policy:CheckIP_bool', label: 'Deny IP address duplication (IPv4)', kind: 'bool', group: 'ipv4' },
  {
    key: 'policy:ArpDhcpOnly_bool',
    label: 'Deny non-ARP / non-DHCP / non-ICMPv6 broadcasts',
    kind: 'bool',
    group: 'ipv4',
  },
  { key: 'policy:PrivacyFilter_bool', label: 'Privacy filter mode', kind: 'bool', group: 'ipv4' },
  { key: 'policy:NoBroadcastLimiter_bool', label: 'Unlimited number of broadcasts', kind: 'bool', group: 'ipv4' },
  { key: 'policy:MaxMac_u32', label: 'Maximum number of MAC addresses', kind: 'int', group: 'ipv4' },
  { key: 'policy:MaxIP_u32', label: 'Maximum number of IP addresses (IPv4)', kind: 'int', group: 'ipv4' },
  { key: 'policy:FilterIPv4_bool', label: 'Filter all IPv4 packets', kind: 'bool', group: 'ipv4' },
  { key: 'policy:FilterNonIP_bool', label: 'Filter all non-IP packets', kind: 'bool', group: 'ipv4' },
  { key: 'policy:VLanId_u32', label: 'VLAN ID (IEEE 802.1Q)', kind: 'int', group: 'ipv4', unit: '0 = disabled' },

  // IPv6 filtering
  { key: 'policy:RSandRAFilter_bool', label: 'Filter RS / RA packets (IPv6)', kind: 'bool', group: 'ipv6' },
  { key: 'policy:RAFilter_bool', label: 'Filter RA packets (IPv6)', kind: 'bool', group: 'ipv6' },
  { key: 'policy:DHCPv6Filter_bool', label: 'Filter DHCP packets (IPv6)', kind: 'bool', group: 'ipv6' },
  { key: 'policy:DHCPv6NoServer_bool', label: 'Disallow DHCP server operation (IPv6)', kind: 'bool', group: 'ipv6' },
  { key: 'policy:NoRoutingV6_bool', label: 'Deny routing operation (IPv6)', kind: 'bool', group: 'ipv6' },
  { key: 'policy:CheckIPv6_bool', label: 'Deny IP address duplication (IPv6)', kind: 'bool', group: 'ipv6' },
  { key: 'policy:NoServerV6_bool', label: 'Deny operation as TCP/IP server (IPv6)', kind: 'bool', group: 'ipv6' },
  { key: 'policy:MaxIPv6_u32', label: 'Maximum number of IP addresses (IPv6)', kind: 'int', group: 'ipv6' },
  { key: 'policy:FilterIPv6_bool', label: 'Filter all IPv6 packets', kind: 'bool', group: 'ipv6' },
  { key: 'policy:NoIPv6DefaultRouterInRA_bool', label: 'No default-router on IPv6 RA', kind: 'bool', group: 'ipv6' },
  {
    key: 'policy:NoIPv6DefaultRouterInRAWhenIPv6_bool',
    label: 'No default-router on IPv6 RA (physical IPv6)',
    kind: 'bool',
    group: 'ipv6',
  },
];

export const policyBool = (subject: Record<string, unknown>, key: string): boolean => subject[key] === true;
export const policyInt = (subject: Record<string, unknown>, key: string): number => Number(subject[key] ?? 0);
