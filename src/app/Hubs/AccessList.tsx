import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ScrollableTable } from '@app/components/ScrollableTable';
import { PlusCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { binToBytes } from '@app/utils/blob_utils';
import { capBool, capValue } from '@app/utils/caps';
import { useServer } from '@app/ServerContext';

const PROTOCOLS: Record<number, string> = { 0: 'Any', 1: 'ICMPv4', 6: 'TCP', 17: 'UDP', 58: 'ICMPv6' };
const KNOWN_PROTOCOLS = new Set([0, 1, 6, 17, 58]);
const ZERO4 = '0.0.0.0';
const FULL4 = '255.255.255.255';
const MAX_NOTE_LENGTH = 255;
const MAX_REDIRECT_URL_LENGTH = 255;
const MAX_DELAY = 10000;
const MAX_PERCENT = 100;

const protocolLabel = (n: number): string => PROTOCOLS[n] ?? `IP ${n}`;

type RuleDraft = {
  id: number;
  note: string;
  active: boolean;
  priority: string;
  discard: boolean;
  ipVersion: 'ipv4' | 'ipv6';
  srcAny: boolean;
  srcIp: string;
  srcMask: string;
  destAny: boolean;
  destIp: string;
  destMask: string;
  protocolKind: string;
  protocolNumber: string;
  srcPortStart: string;
  srcPortEnd: string;
  destPortStart: string;
  destPortEnd: string;
  srcUsername: string;
  destUsername: string;
  checkSrcMac: boolean;
  srcMac: string;
  srcMacMask: string;
  checkDstMac: boolean;
  dstMac: string;
  dstMacMask: string;
  checkTcpState: boolean;
  established: boolean;
  delay: string;
  jitter: string;
  loss: string;
  redirectEnabled: boolean;
  redirectUrl: string;
};

type EditorState = {
  mode: 'create' | 'edit' | 'clone';
  draft: RuleDraft;
};

type AccessCaps = {
  supportIpv6: boolean;
  supportMac: boolean;
  supportTcpState: boolean;
  supportSimulation: boolean;
  supportRedirect: boolean;
  supportGroups: boolean;
  maxRules: number;
};

const accessCapsFromServer = (capsList: unknown[]): AccessCaps => ({
  supportIpv6: capBool(capsList, 'b_support_ipv6_acl'),
  supportMac: capBool(capsList, 'b_support_check_mac'),
  supportTcpState: capBool(capsList, 'b_support_check_tcp_state'),
  supportSimulation: capBool(capsList, 'b_support_ex_acl'),
  supportRedirect: capBool(capsList, 'b_support_redirect_url_acl'),
  supportGroups: capBool(capsList, 'b_support_acl_group'),
  // Native parity (SmAccessListDlgUpdate): 0 means no rules can be created.
  maxRules: capValue(capsList, 'i_max_access_lists'),
});

const parseInteger = (value: string): number | null => {
  const text = value.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  return Number(text);
};

const parseOptionalInteger = (value: string): number => parseInteger(value) ?? 0;

const parseIpv4 = (value: string): number[] | null => {
  const parts = value.trim().split('.');
  if (parts.length !== 4) {
    return null;
  }
  const bytes = parts.map((part) => parseInteger(part));
  if (bytes.some((part) => part === null || part < 0 || part > 255)) {
    return null;
  }
  return bytes as number[];
};

const isIpv4 = (value: string): boolean => parseIpv4(value) !== null;

const ipv4Any = (ip: string, mask: string): boolean => ip === ZERO4 && mask === ZERO4;

const parseIpv4Tail = (value: string): number[] | null => {
  const bytes = parseIpv4(value);
  if (!bytes) {
    return null;
  }
  return [(bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]];
};

const parseIpv6Part = (value: string): number[] | null => {
  if (value === '') {
    return [];
  }
  const pieces = value.split(':');
  const groups: number[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (piece.includes('.')) {
      if (i !== pieces.length - 1) {
        return null;
      }
      const tail = parseIpv4Tail(piece);
      if (!tail) {
        return null;
      }
      groups.push(...tail);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) {
      return null;
    }
    groups.push(parseInt(piece, 16));
  }
  return groups;
};

const parseIpv6 = (value: string): Uint8Array | null => {
  const text = value.trim();
  if (!text) {
    return null;
  }
  const split = text.split('::');
  if (split.length > 2) {
    return null;
  }
  const head = parseIpv6Part(split[0]);
  const tail = split.length === 2 ? parseIpv6Part(split[1]) : [];
  if (!head || !tail) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if ((split.length === 1 && missing !== 0) || (split.length === 2 && missing < 1)) {
    return null;
  }
  const groups = split.length === 2 ? head.concat(new Array(missing).fill(0), tail) : head;
  if (groups.length !== 8 || groups.some((group) => group < 0 || group > 0xffff)) {
    return null;
  }
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
};

const ipv6ToString = (bytes: Uint8Array | null): string => {
  if (!bytes || bytes.length !== 16) {
    return '';
  }
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  }
  return groups.join(':');
};

const ipv6MaskFromPrefix = (prefix: number): Uint8Array => {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < prefix; i++) {
    bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
  }
  return bytes;
};

const parseIpv6Mask = (value: string): Uint8Array | null => {
  const text = value.trim();
  if (text.startsWith('/')) {
    const prefix = parseInteger(text.slice(1));
    if (prefix === null || prefix < 0 || prefix > 128) {
      return null;
    }
    return ipv6MaskFromPrefix(prefix);
  }
  return parseIpv6(text);
};

const ipv6MaskToPrefix = (bytes: Uint8Array | null): number | null => {
  if (!bytes || bytes.length !== 16) {
    return null;
  }
  let prefix = 0;
  let seenZero = false;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    for (let bit = 7; bit >= 0; bit--) {
      const one = (byte & (1 << bit)) !== 0;
      if (one && seenZero) {
        return null;
      }
      if (one) {
        prefix++;
      } else {
        seenZero = true;
      }
    }
  }
  return prefix;
};

const isZeroBytes = (bytes: Uint8Array | null, length: number): boolean =>
  !bytes || bytes.length !== length || bytes.every((byte) => byte === 0);

const bytesOrZero = (value: unknown, length: number): Uint8Array => {
  const bytes = binToBytes(value);
  return bytes && bytes.length === length ? bytes : new Uint8Array(length);
};

const macToString = (bytes: Uint8Array | null): string => {
  if (!bytes || bytes.length !== 6) {
    return '';
  }
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(':');
};

const parseMac = (value: string): Uint8Array | null => {
  const text = value.trim();
  const hex = text.includes(':') || text.includes('-') ? text.split(/[:-]/).join('') : text;
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const formatIpv6Mask = (bytes: Uint8Array | null): string => {
  const prefix = ipv6MaskToPrefix(bytes);
  return prefix !== null ? `/${prefix}` : ipv6ToString(bytes);
};

function endpoint(rule: VPN.VpnAccess, side: 'src' | 'dest'): string {
  if (rule.IsIPv6_bool) {
    const record = rule as unknown as Record<string, unknown>;
    const ip = bytesOrZero(record[side === 'src' ? 'SrcIpAddress6_bin' : 'DestIpAddress6_bin'], 16);
    const mask = bytesOrZero(record[side === 'src' ? 'SrcSubnetMask6_bin' : 'DestSubnetMask6_bin'], 16);
    if (isZeroBytes(ip, 16) && isZeroBytes(mask, 16)) {
      return 'any';
    }
    return `${ipv6ToString(ip)}${formatIpv6Mask(mask)}`;
  }

  const ip = side === 'src' ? rule.SrcIpAddress_ip : rule.DestIpAddress_ip;
  const mask = side === 'src' ? rule.SrcSubnetMask_ip : rule.DestSubnetMask_ip;
  if (!ip || ipv4Any(ip, mask)) {
    return 'any';
  }
  return mask === FULL4 ? ip : `${ip}/${mask}`;
}

const portSummary = (rule: VPN.VpnAccess): string => {
  if (rule.Protocol_u32 !== 6 && rule.Protocol_u32 !== 17) {
    return '-';
  }
  const source =
    rule.SrcPortStart_u32 === 0
      ? 'any'
      : rule.SrcPortEnd_u32 && rule.SrcPortEnd_u32 !== rule.SrcPortStart_u32
        ? `${rule.SrcPortStart_u32}-${rule.SrcPortEnd_u32}`
        : String(rule.SrcPortStart_u32);
  const destination =
    rule.DestPortStart_u32 === 0
      ? 'any'
      : rule.DestPortEnd_u32 && rule.DestPortEnd_u32 !== rule.DestPortStart_u32
        ? `${rule.DestPortStart_u32}-${rule.DestPortEnd_u32}`
        : String(rule.DestPortStart_u32);
  return `Src ${source} / Dst ${destination}`;
};

const nextPriority = (rules: VPN.VpnAccess[] | null): number => {
  const max = rules?.reduce((value, rule) => Math.max(value, rule.Priority_u32), 0) ?? 0;
  return (max === 0 ? 900 : max) + 100;
};

const defaultRule = (rules: VPN.VpnAccess[] | null, ipv6: boolean): VPN.VpnAccess =>
  new VPN.VpnAccess({
    Note_utf: '',
    Active_bool: true,
    Priority_u32: nextPriority(rules),
    Discard_bool: false,
    IsIPv6_bool: ipv6,
    SrcIpAddress_ip: ZERO4,
    SrcSubnetMask_ip: ZERO4,
    DestIpAddress_ip: ZERO4,
    DestSubnetMask_ip: ZERO4,
    SrcIpAddress6_bin: new Uint8Array(16),
    SrcSubnetMask6_bin: new Uint8Array(16),
    DestIpAddress6_bin: new Uint8Array(16),
    DestSubnetMask6_bin: new Uint8Array(16),
    Protocol_u32: 0 as VPN.VpnIpProtocolNumber,
    SrcPortStart_u32: 0,
    SrcPortEnd_u32: 0,
    DestPortStart_u32: 0,
    DestPortEnd_u32: 0,
    SrcUsername_str: '',
    DestUsername_str: '',
    CheckSrcMac_bool: false,
    SrcMacAddress_bin: new Uint8Array(6),
    SrcMacMask_bin: new Uint8Array(6),
    CheckDstMac_bool: false,
    DstMacAddress_bin: new Uint8Array(6),
    DstMacMask_bin: new Uint8Array(6),
    CheckTcpState_bool: false,
    Established_bool: false,
    Delay_u32: 0,
    Jitter_u32: 0,
    Loss_u32: 0,
    RedirectUrl_str: '',
  });

const draftFromRule = (rule: VPN.VpnAccess): RuleDraft => {
  const record = rule as unknown as Record<string, unknown>;
  const src6 = bytesOrZero(record.SrcIpAddress6_bin, 16);
  const srcMask6 = bytesOrZero(record.SrcSubnetMask6_bin, 16);
  const dest6 = bytesOrZero(record.DestIpAddress6_bin, 16);
  const destMask6 = bytesOrZero(record.DestSubnetMask6_bin, 16);
  const checkSrcMac = Boolean(rule.CheckSrcMac_bool);
  const checkDstMac = Boolean(rule.CheckDstMac_bool);
  return {
    id: rule.Id_u32,
    note: rule.Note_utf ?? '',
    active: rule.Active_bool,
    priority: String(rule.Priority_u32 || ''),
    discard: rule.Discard_bool,
    ipVersion: rule.IsIPv6_bool ? 'ipv6' : 'ipv4',
    srcAny: rule.IsIPv6_bool ? isZeroBytes(src6, 16) && isZeroBytes(srcMask6, 16) : ipv4Any(rule.SrcIpAddress_ip, rule.SrcSubnetMask_ip),
    srcIp: rule.IsIPv6_bool ? ipv6ToString(src6) : rule.SrcIpAddress_ip || ZERO4,
    srcMask: rule.IsIPv6_bool ? formatIpv6Mask(srcMask6) : rule.SrcSubnetMask_ip || ZERO4,
    destAny: rule.IsIPv6_bool ? isZeroBytes(dest6, 16) && isZeroBytes(destMask6, 16) : ipv4Any(rule.DestIpAddress_ip, rule.DestSubnetMask_ip),
    destIp: rule.IsIPv6_bool ? ipv6ToString(dest6) : rule.DestIpAddress_ip || ZERO4,
    destMask: rule.IsIPv6_bool ? formatIpv6Mask(destMask6) : rule.DestSubnetMask_ip || ZERO4,
    protocolKind: KNOWN_PROTOCOLS.has(rule.Protocol_u32) ? String(rule.Protocol_u32) : 'custom',
    protocolNumber: String(rule.Protocol_u32 || ''),
    srcPortStart: rule.SrcPortStart_u32 ? String(rule.SrcPortStart_u32) : '',
    srcPortEnd: rule.SrcPortEnd_u32 ? String(rule.SrcPortEnd_u32) : '',
    destPortStart: rule.DestPortStart_u32 ? String(rule.DestPortStart_u32) : '',
    destPortEnd: rule.DestPortEnd_u32 ? String(rule.DestPortEnd_u32) : '',
    srcUsername: rule.SrcUsername_str ?? '',
    destUsername: rule.DestUsername_str ?? '',
    checkSrcMac,
    srcMac: checkSrcMac ? macToString(bytesOrZero(record.SrcMacAddress_bin, 6)) : '',
    srcMacMask: checkSrcMac ? macToString(bytesOrZero(record.SrcMacMask_bin, 6)) : '',
    checkDstMac,
    dstMac: checkDstMac ? macToString(bytesOrZero(record.DstMacAddress_bin, 6)) : '',
    dstMacMask: checkDstMac ? macToString(bytesOrZero(record.DstMacMask_bin, 6)) : '',
    checkTcpState: rule.CheckTcpState_bool,
    established: rule.Established_bool,
    delay: rule.Delay_u32 ? String(rule.Delay_u32) : '',
    jitter: rule.Jitter_u32 ? String(rule.Jitter_u32) : '',
    loss: rule.Loss_u32 ? String(rule.Loss_u32) : '',
    redirectEnabled: Boolean(rule.RedirectUrl_str),
    redirectUrl: rule.RedirectUrl_str ?? '',
  };
};

const selectedProtocol = (draft: RuleDraft): number => {
  if (draft.protocolKind === 'custom') {
    return parseOptionalInteger(draft.protocolNumber);
  }
  return Number(draft.protocolKind);
};

const validatePortRange = (start: string, end: string, label: string, errors: string[]) => {
  const startValue = start.trim() === '' ? 0 : parseInteger(start);
  const endValue = end.trim() === '' ? 0 : parseInteger(end);
  if (startValue === null || endValue === null || startValue > 65535 || endValue > 65535) {
    errors.push(`${label} ports must be between 0 and 65535.`);
    return;
  }
  if (startValue === 0 && endValue !== 0) {
    errors.push(`${label} port range needs a start port.`);
  }
  if (startValue !== 0 && endValue !== 0 && startValue > endValue) {
    errors.push(`${label} start port must be less than or equal to the end port.`);
  }
};

const validateDraft = (draft: RuleDraft, caps: AccessCaps): string[] => {
  const errors: string[] = [];
  const priority = parseInteger(draft.priority);
  if (priority === null || priority < 1) {
    errors.push('Priority must be 1 or higher.');
  }
  if (draft.note.length > MAX_NOTE_LENGTH) {
    errors.push(`Note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }
  if (draft.ipVersion === 'ipv6' && !caps.supportIpv6) {
    errors.push('This server does not support IPv6 access list rules.');
  } else if (draft.ipVersion === 'ipv4') {
    if (!draft.srcAny && (!isIpv4(draft.srcIp) || !isIpv4(draft.srcMask))) {
      errors.push('Source IPv4 address and mask must be valid.');
    }
    if (!draft.destAny && (!isIpv4(draft.destIp) || !isIpv4(draft.destMask))) {
      errors.push('Destination IPv4 address and mask must be valid.');
    }
  } else {
    if (!draft.srcAny && (!parseIpv6(draft.srcIp) || !parseIpv6Mask(draft.srcMask))) {
      errors.push('Source IPv6 address and mask must be valid.');
    }
    if (!draft.destAny && (!parseIpv6(draft.destIp) || !parseIpv6Mask(draft.destMask))) {
      errors.push('Destination IPv6 address and mask must be valid.');
    }
  }

  if (draft.protocolKind === 'custom') {
    const protocol = parseInteger(draft.protocolNumber);
    if (protocol === null || protocol < 0 || protocol > 255) {
      errors.push('Protocol number must be between 0 and 255.');
    }
  }

  const protocol = selectedProtocol(draft);
  if (protocol === 6 || protocol === 17) {
    validatePortRange(draft.srcPortStart, draft.srcPortEnd, 'Source', errors);
    validatePortRange(draft.destPortStart, draft.destPortEnd, 'Destination', errors);
  }

  if (caps.supportMac && draft.checkSrcMac && (!parseMac(draft.srcMac) || !parseMac(draft.srcMacMask))) {
    errors.push('Source MAC address and mask must be valid.');
  }
  if (caps.supportMac && draft.checkDstMac && (!parseMac(draft.dstMac) || !parseMac(draft.dstMacMask))) {
    errors.push('Destination MAC address and mask must be valid.');
  }
  if (caps.supportTcpState && draft.checkTcpState && protocol !== 6) {
    errors.push('TCP state matching is only available for TCP rules.');
  }

  const delay = draft.delay.trim() === '' ? 0 : parseInteger(draft.delay);
  const jitter = draft.jitter.trim() === '' ? 0 : parseInteger(draft.jitter);
  const loss = draft.loss.trim() === '' ? 0 : parseInteger(draft.loss);
  if (caps.supportSimulation && (delay === null || delay < 0 || delay > MAX_DELAY)) {
    errors.push(`Delay must be between 0 and ${MAX_DELAY} ms.`);
  }
  if (caps.supportSimulation && (jitter === null || jitter < 0 || jitter > MAX_PERCENT)) {
    errors.push('Jitter must be between 0 and 100 percent.');
  }
  if (caps.supportSimulation && (loss === null || loss < 0 || loss > MAX_PERCENT)) {
    errors.push('Packet loss must be between 0 and 100 percent.');
  }
  if (caps.supportRedirect && draft.redirectEnabled && !draft.discard) {
    const url = draft.redirectUrl.trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://')) || url.length > MAX_REDIRECT_URL_LENGTH) {
      errors.push('Redirect URL must start with http:// or https:// and fit within 255 characters.');
    }
  }
  return errors;
};

const ruleFromDraft = (draft: RuleDraft, caps: AccessCaps): VPN.VpnAccess => {
  const protocol = selectedProtocol(draft);
  const tcpOrUdp = protocol === 6 || protocol === 17;
  const pass = !draft.discard;
  const srcIp6 = draft.ipVersion === 'ipv6' && !draft.srcAny ? parseIpv6(draft.srcIp) : new Uint8Array(16);
  const srcMask6 = draft.ipVersion === 'ipv6' && !draft.srcAny ? parseIpv6Mask(draft.srcMask) : new Uint8Array(16);
  const destIp6 = draft.ipVersion === 'ipv6' && !draft.destAny ? parseIpv6(draft.destIp) : new Uint8Array(16);
  const destMask6 = draft.ipVersion === 'ipv6' && !draft.destAny ? parseIpv6Mask(draft.destMask) : new Uint8Array(16);

  return new VPN.VpnAccess({
    Id_u32: draft.id,
    Note_utf: draft.note,
    Active_bool: draft.active,
    Priority_u32: parseOptionalInteger(draft.priority),
    Discard_bool: draft.discard,
    IsIPv6_bool: draft.ipVersion === 'ipv6',
    SrcIpAddress_ip: draft.ipVersion === 'ipv4' && !draft.srcAny ? draft.srcIp.trim() : ZERO4,
    SrcSubnetMask_ip: draft.ipVersion === 'ipv4' && !draft.srcAny ? draft.srcMask.trim() : ZERO4,
    DestIpAddress_ip: draft.ipVersion === 'ipv4' && !draft.destAny ? draft.destIp.trim() : ZERO4,
    DestSubnetMask_ip: draft.ipVersion === 'ipv4' && !draft.destAny ? draft.destMask.trim() : ZERO4,
    SrcIpAddress6_bin: srcIp6 ?? new Uint8Array(16),
    SrcSubnetMask6_bin: srcMask6 ?? new Uint8Array(16),
    DestIpAddress6_bin: destIp6 ?? new Uint8Array(16),
    DestSubnetMask6_bin: destMask6 ?? new Uint8Array(16),
    Protocol_u32: protocol,
    SrcPortStart_u32: tcpOrUdp ? parseOptionalInteger(draft.srcPortStart) : 0,
    SrcPortEnd_u32: tcpOrUdp ? parseOptionalInteger(draft.srcPortEnd) : 0,
    DestPortStart_u32: tcpOrUdp ? parseOptionalInteger(draft.destPortStart) : 0,
    DestPortEnd_u32: tcpOrUdp ? parseOptionalInteger(draft.destPortEnd) : 0,
    SrcUsername_str: draft.srcUsername.trim(),
    DestUsername_str: draft.destUsername.trim(),
    CheckSrcMac_bool: caps.supportMac && draft.checkSrcMac,
    SrcMacAddress_bin: caps.supportMac && draft.checkSrcMac ? (parseMac(draft.srcMac) ?? new Uint8Array(6)) : new Uint8Array(6),
    SrcMacMask_bin: caps.supportMac && draft.checkSrcMac ? (parseMac(draft.srcMacMask) ?? new Uint8Array(6)) : new Uint8Array(6),
    CheckDstMac_bool: caps.supportMac && draft.checkDstMac,
    DstMacAddress_bin: caps.supportMac && draft.checkDstMac ? (parseMac(draft.dstMac) ?? new Uint8Array(6)) : new Uint8Array(6),
    DstMacMask_bin: caps.supportMac && draft.checkDstMac ? (parseMac(draft.dstMacMask) ?? new Uint8Array(6)) : new Uint8Array(6),
    CheckTcpState_bool: caps.supportTcpState && draft.checkTcpState && protocol === 6,
    Established_bool: caps.supportTcpState && draft.checkTcpState && protocol === 6 ? draft.established : false,
    Delay_u32: caps.supportSimulation && pass ? parseOptionalInteger(draft.delay) : 0,
    Jitter_u32: caps.supportSimulation && pass ? parseOptionalInteger(draft.jitter) : 0,
    Loss_u32: caps.supportSimulation && pass ? parseOptionalInteger(draft.loss) : 0,
    RedirectUrl_str: caps.supportRedirect && pass && draft.redirectEnabled ? draft.redirectUrl.trim() : '',
  });
};

const normalizeRuleForSave = (rule: VPN.VpnAccess): VPN.VpnAccess => {
  const record = rule as unknown as Record<string, unknown>;
  return new VPN.VpnAccess({
    ...rule,
    SrcIpAddress6_bin: bytesOrZero(record.SrcIpAddress6_bin, 16),
    SrcSubnetMask6_bin: bytesOrZero(record.SrcSubnetMask6_bin, 16),
    DestIpAddress6_bin: bytesOrZero(record.DestIpAddress6_bin, 16),
    DestSubnetMask6_bin: bytesOrZero(record.DestSubnetMask6_bin, 16),
    SrcMacAddress_bin: bytesOrZero(record.SrcMacAddress_bin, 6),
    SrcMacMask_bin: bytesOrZero(record.SrcMacMask_bin, 6),
    DstMacAddress_bin: bytesOrZero(record.DstMacAddress_bin, 6),
    DstMacMask_bin: bytesOrZero(record.DstMacMask_bin, 6),
  });
};

const clonePriority = (rules: VPN.VpnAccess[], original: VPN.VpnAccess): number => {
  const used = new Set(rules.map((rule) => rule.Priority_u32));
  for (let priority = original.Priority_u32; priority < Number.MAX_SAFE_INTEGER; priority++) {
    if (!used.has(priority)) {
      return priority;
    }
  }
  return nextPriority(rules);
};

const AccessList: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const { capsList } = useServer();
  const caps = React.useMemo(() => accessCapsFromServer(capsList), [capsList]);
  const [rules, setRules] = React.useState<VPN.VpnAccess[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<number | null>(null);
  const [editor, setEditor] = React.useState<EditorState | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    api
      .EnumAccess(new VPN.VpnRpcEnumAccessList({ HubName_str: hub }))
      .then((response) => setRules(response.AccessList ?? []))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  // SetAccessList replaces the whole list, so build it from a fresh
  // EnumAccess rather than from rows loaded earlier: a concurrent change by
  // another administrator is kept instead of silently overwritten. mutate
  // returns null when its target rule no longer exists on the server.
  const replaceList = (mutate: (fresh: VPN.VpnAccess[]) => VPN.VpnAccess[] | null, onSaved?: () => void) => {
    setBusy(true);
    setError(null);
    api
      .EnumAccess(new VPN.VpnRpcEnumAccessList({ HubName_str: hub }))
      .then((response) => {
        const fresh = response.AccessList ?? [];
        const next = mutate(fresh);
        if (next === null) {
          setRules(fresh);
          setBusy(false);
          setError('The rule no longer exists on the server; the list has been refreshed.');
          return undefined;
        }
        return api
          .SetAccessList(
            new VPN.VpnRpcEnumAccessList({
              HubName_str: hub,
              AccessList: next.map(normalizeRuleForSave),
            }),
          )
          .then(() => {
            onSaved?.();
            setBusy(false);
            load();
          });
      })
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
  };

  const toggleActive = (id: number, active: boolean) => {
    replaceList((fresh) =>
      fresh.some((r) => r.Id_u32 === id)
        ? (fresh.map((r) => (r.Id_u32 === id ? { ...r, Active_bool: active } : r)) as VPN.VpnAccess[])
        : null,
    );
  };

  const openCreate = (ipv6: boolean) => {
    setEditor({ mode: 'create', draft: draftFromRule(defaultRule(rules, ipv6)) });
  };

  const openEdit = (rule: VPN.VpnAccess) => {
    setEditor({ mode: 'edit', draft: draftFromRule(rule) });
  };

  const openClone = (rule: VPN.VpnAccess) => {
    const clone = normalizeRuleForSave(
      new VPN.VpnAccess({ ...rule, Id_u32: 0, Priority_u32: rules ? clonePriority(rules, rule) : rule.Priority_u32 }),
    );
    setEditor({ mode: 'clone', draft: draftFromRule(clone) });
  };

  const setDraft = (patch: Partial<RuleDraft>) =>
    setEditor((prev) => (prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev));

  const saveEditor = () => {
    if (!editor || !rules) {
      return;
    }
    const rule = ruleFromDraft(editor.draft, caps);
    if (editor.mode === 'create' || editor.mode === 'clone') {
      setBusy(true);
      api
        .AddAccess(new VPN.VpnRpcAddAccess({ HubName_str: hub, AccessListSingle: [rule] }))
        .then(() => {
          setEditor(null);
          setBusy(false);
          load();
        })
        .catch((e) => {
          setError(String(e));
          setBusy(false);
        });
      return;
    }
    replaceList(
      (fresh) =>
        fresh.some((item) => item.Id_u32 === editor.draft.id)
          ? fresh.map((item) => (item.Id_u32 === editor.draft.id ? rule : item))
          : null,
      () => setEditor(null),
    );
  };

  const confirmDelete = () => {
    if (pendingDelete === null) {
      return;
    }
    const id = pendingDelete;
    setBusy(true);
    api
      .DeleteAccess(new VPN.VpnRpcDeleteAccess({ HubName_str: hub, Id_u32: id }))
      .then(() => {
        setPendingDelete(null);
        load();
      })
      .catch((e) => {
        setPendingDelete(null);
        setError(String(e));
      })
      .finally(() => setBusy(false));
  };

  const isLoading = rules === null && error === null;
  const canAddRule = rules === null || rules.length < caps.maxRules;
  const draft = editor?.draft;
  const validation = draft ? validateDraft(draft, caps) : [];
  const protocol = draft ? selectedProtocol(draft) : 0;
  const showPorts = protocol === 6 || protocol === 17;
  const showTcpState = caps.supportTcpState && protocol === 6;
  const allowPassEffects = draft ? !draft.discard : false;

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => openCreate(false)} isDisabled={isLoading || busy || !canAddRule}>
            New IPv4 rule
          </Button>
        </FlexItem>
        <FlexItem>
          <Button
            variant="secondary"
            icon={<PlusCircleIcon />}
            onClick={() => openCreate(true)}
            isDisabled={isLoading || busy || !canAddRule || !caps.supportIpv6}
          >
            New IPv6 rule
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="Access list operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading access list" />
        </Bullseye>
      ) : rules !== null && rules.length === 0 ? (
        <EmptyState titleText="No access list rules" headingLevel="h2">
          <EmptyStateBody>With no rules, all packets are passed. Rules are evaluated by priority.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => openCreate(false)} isDisabled={!canAddRule}>
                New IPv4 rule
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : rules !== null ? (
        <ScrollableTable aria-label="Access list" variant="compact">
          <Thead>
            <Tr>
              <Th>ID</Th>
              <Th>Action</Th>
              <Th>Status</Th>
              <Th>Priority</Th>
              <Th>Protocol</Th>
              <Th>Source</Th>
              <Th>Destination</Th>
              <Th>Ports</Th>
              <Th>Memo</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {rules.map((rule) => (
              <Tr key={rule.Id_u32}>
                <Td dataLabel="ID">{rule.Id_u32}</Td>
                <Td dataLabel="Action">
                  <Label color={rule.Discard_bool ? 'red' : 'green'} isCompact>
                    {rule.Discard_bool ? 'Discard' : 'Pass'}
                  </Label>
                </Td>
                <Td dataLabel="Status">
                  <Switch
                    id={`access-active-${rule.Id_u32}`}
                    aria-label={`Rule ${rule.Id_u32} active`}
                    isChecked={rule.Active_bool}
                    isDisabled={busy}
                    onChange={(_event, checked) => toggleActive(rule.Id_u32, checked)}
                  />
                </Td>
                <Td dataLabel="Priority">{rule.Priority_u32.toLocaleString()}</Td>
                <Td dataLabel="Protocol">{protocolLabel(rule.Protocol_u32)}</Td>
                <Td dataLabel="Source">{endpoint(rule, 'src')}</Td>
                <Td dataLabel="Destination">{endpoint(rule, 'dest')}</Td>
                <Td dataLabel="Ports">{portSummary(rule)}</Td>
                <Td dataLabel="Memo">{rule.Note_utf || '-'}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      { title: 'Edit', onClick: () => openEdit(rule) },
                      { title: 'Clone', onClick: () => openClone(rule), isAriaDisabled: !canAddRule },
                      { isSeparator: true },
                      { title: 'Delete', onClick: () => setPendingDelete(rule.Id_u32) },
                    ]}
                    isDisabled={busy}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </ScrollableTable>
      ) : null}

      <Modal variant={ModalVariant.large} isOpen={editor !== null} onClose={() => setEditor(null)}>
        <ModalHeader
          title={
            editor?.mode === 'create'
              ? 'New access list rule'
              : editor?.mode === 'clone'
                ? 'Clone access list rule'
                : `Edit access list rule #${draft?.id}`
          }
        />
        <ModalBody>
          {draft && (
            <Form>
              {validation.length > 0 && (
                <Alert variant="warning" title="Rule is not ready to save" isInline>
                  {validation[0]}
                </Alert>
              )}
              <Alert variant="info" title="Access list rule order" isInline>
                Rules apply to IP packets passing through this Virtual Hub. Lower priority numbers are evaluated first;
                packets that do not match any rule are passed.
              </Alert>
              <Flex gap={{ default: 'gapMd' }}>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label="Action" fieldId="access-action">
                    <FormSelect
                      id="access-action"
                      value={draft.discard ? 'discard' : 'pass'}
                      onChange={(_event, value) => setDraft({ discard: value === 'discard' })}
                      aria-label="Action"
                    >
                      <FormSelectOption value="pass" label="Pass" />
                      <FormSelectOption value="discard" label="Discard" />
                    </FormSelect>
                  </FormGroup>
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label="Priority" isRequired fieldId="access-priority">
                    <TextInput
                      id="access-priority"
                      type="number"
                      min={1}
                      value={draft.priority}
                      onChange={(_event, value) => setDraft({ priority: value })}
                      aria-label="Priority"
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>Smaller numbers have higher priority.</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label="IP version" fieldId="access-ip-version">
                    <FormSelect
                      id="access-ip-version"
                      value={draft.ipVersion}
                      onChange={(_event, value) => setDraft({ ipVersion: value as RuleDraft['ipVersion'] })}
                      isDisabled={editor.mode !== 'create' || !caps.supportIpv6}
                      aria-label="IP version"
                    >
                      <FormSelectOption value="ipv4" label="IPv4" />
                      <FormSelectOption value="ipv6" label="IPv6" />
                    </FormSelect>
                  </FormGroup>
                </FlexItem>
              </Flex>

              <FormGroup label="Memo" fieldId="access-note">
                <TextInput
                  id="access-note"
                  maxLength={MAX_NOTE_LENGTH}
                  value={draft.note}
                  onChange={(_event, value) => setDraft({ note: value })}
                  aria-label="Memo"
                />
              </FormGroup>

              <Flex gap={{ default: 'gapLg' }}>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label="Source" fieldId="access-src-any">
                    <Checkbox
                      id="access-src-any"
                      label="Any source"
                      isChecked={draft.srcAny}
                      onChange={(_event, checked) => setDraft({ srcAny: checked })}
                    />
                  </FormGroup>
                  <Flex gap={{ default: 'gapSm' }}>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <TextInput
                        id="access-src-ip"
                        value={draft.srcIp}
                        isDisabled={draft.srcAny}
                        onChange={(_event, value) => setDraft({ srcIp: value })}
                        aria-label="Source IP address"
                      />
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <TextInput
                        id="access-src-mask"
                        value={draft.srcMask}
                        isDisabled={draft.srcAny}
                        onChange={(_event, value) => setDraft({ srcMask: value })}
                        aria-label="Source subnet mask"
                      />
                    </FlexItem>
                  </Flex>
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {draft.ipVersion === 'ipv6'
                          ? 'Use an IPv6 mask or /prefix; /128 matches one host.'
                          : 'Use an IPv4 address and mask; 255.255.255.255 matches one host.'}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label="Destination" fieldId="access-dest-any">
                    <Checkbox
                      id="access-dest-any"
                      label="Any destination"
                      isChecked={draft.destAny}
                      onChange={(_event, checked) => setDraft({ destAny: checked })}
                    />
                  </FormGroup>
                  <Flex gap={{ default: 'gapSm' }}>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <TextInput
                        id="access-dest-ip"
                        value={draft.destIp}
                        isDisabled={draft.destAny}
                        onChange={(_event, value) => setDraft({ destIp: value })}
                        aria-label="Destination IP address"
                      />
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <TextInput
                        id="access-dest-mask"
                        value={draft.destMask}
                        isDisabled={draft.destAny}
                        onChange={(_event, value) => setDraft({ destMask: value })}
                        aria-label="Destination subnet mask"
                      />
                    </FlexItem>
                  </Flex>
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {draft.ipVersion === 'ipv6'
                          ? 'Use an IPv6 mask or /prefix; /128 matches one host.'
                          : 'Use an IPv4 address and mask; 255.255.255.255 matches one host.'}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FlexItem>
              </Flex>

              <Flex gap={{ default: 'gapMd' }}>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label="Protocol" fieldId="access-protocol">
                    <FormSelect
                      id="access-protocol"
                      value={draft.protocolKind}
                      onChange={(_event, value) => setDraft({ protocolKind: value })}
                      aria-label="Protocol"
                    >
                      <FormSelectOption value="0" label="Any" />
                      <FormSelectOption value="6" label="TCP" />
                      <FormSelectOption value="17" label="UDP" />
                      <FormSelectOption value="1" label="ICMPv4" />
                      <FormSelectOption value="58" label="ICMPv6" />
                      <FormSelectOption value="custom" label="Custom protocol number" />
                    </FormSelect>
                  </FormGroup>
                </FlexItem>
                {draft.protocolKind === 'custom' && (
                  <FlexItem flex={{ default: 'flex_1' }}>
                    <FormGroup label="Protocol number" fieldId="access-protocol-number">
                      <TextInput
                        id="access-protocol-number"
                        type="number"
                        min={0}
                        max={255}
                        value={draft.protocolNumber}
                        onChange={(_event, value) => setDraft({ protocolNumber: value })}
                        aria-label="Protocol number"
                      />
                    </FormGroup>
                  </FlexItem>
                )}
              </Flex>

              {showPorts && (
                <>
                  <Flex gap={{ default: 'gapLg' }}>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="Source ports" fieldId="access-src-port-start">
                        <Flex gap={{ default: 'gapSm' }}>
                          <FlexItem flex={{ default: 'flex_1' }}>
                            <TextInput
                              id="access-src-port-start"
                              type="number"
                              min={0}
                              max={65535}
                              value={draft.srcPortStart}
                              onChange={(_event, value) => setDraft({ srcPortStart: value })}
                              aria-label="Source port start"
                            />
                          </FlexItem>
                          <FlexItem flex={{ default: 'flex_1' }}>
                            <TextInput
                              id="access-src-port-end"
                              type="number"
                              min={0}
                              max={65535}
                              value={draft.srcPortEnd}
                              onChange={(_event, value) => setDraft({ srcPortEnd: value })}
                              aria-label="Source port end"
                            />
                          </FlexItem>
                        </Flex>
                      </FormGroup>
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="Destination ports" fieldId="access-dest-port-start">
                        <Flex gap={{ default: 'gapSm' }}>
                          <FlexItem flex={{ default: 'flex_1' }}>
                            <TextInput
                              id="access-dest-port-start"
                              type="number"
                              min={0}
                              max={65535}
                              value={draft.destPortStart}
                              onChange={(_event, value) => setDraft({ destPortStart: value })}
                              aria-label="Destination port start"
                            />
                          </FlexItem>
                          <FlexItem flex={{ default: 'flex_1' }}>
                            <TextInput
                              id="access-dest-port-end"
                              type="number"
                              min={0}
                              max={65535}
                              value={draft.destPortEnd}
                              onChange={(_event, value) => setDraft({ destPortEnd: value })}
                              aria-label="Destination port end"
                            />
                          </FlexItem>
                        </Flex>
                      </FormGroup>
                    </FlexItem>
                  </Flex>
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>Blank port fields match any port. To match a single port, set only the start value.</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </>
              )}

              <Flex gap={{ default: 'gapLg' }}>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label={caps.supportGroups ? 'Source user or group' : 'Source user'} fieldId="access-src-user">
                    <TextInput
                      id="access-src-user"
                      value={draft.srcUsername}
                      onChange={(_event, value) => setDraft({ srcUsername: value })}
                      aria-label={caps.supportGroups ? 'Source user or group' : 'Source user'}
                    />
                  </FormGroup>
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <FormGroup label={caps.supportGroups ? 'Destination user or group' : 'Destination user'} fieldId="access-dest-user">
                    <TextInput
                      id="access-dest-user"
                      value={draft.destUsername}
                      onChange={(_event, value) => setDraft({ destUsername: value })}
                      aria-label={caps.supportGroups ? 'Destination user or group' : 'Destination user'}
                    />
                  </FormGroup>
                </FlexItem>
              </Flex>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {caps.supportGroups
                      ? 'User and group filters are optional. Leave both fields blank to match all sessions.'
                      : 'User filters are optional. Leave both fields blank to match all sessions.'}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>

              {caps.supportMac && (
                <>
                  <Flex gap={{ default: 'gapLg' }}>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="Source MAC" fieldId="access-src-mac-check">
                        <Checkbox
                          id="access-src-mac-check"
                          label="Match source MAC"
                          isChecked={draft.checkSrcMac}
                          onChange={(_event, checked) => setDraft({ checkSrcMac: checked })}
                        />
                      </FormGroup>
                      <Flex gap={{ default: 'gapSm' }}>
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <TextInput
                            id="access-src-mac"
                            value={draft.srcMac}
                            isDisabled={!draft.checkSrcMac}
                            onChange={(_event, value) => setDraft({ srcMac: value })}
                            aria-label="Source MAC address"
                          />
                        </FlexItem>
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <TextInput
                            id="access-src-mac-mask"
                            value={draft.srcMacMask}
                            isDisabled={!draft.checkSrcMac}
                            onChange={(_event, value) => setDraft({ srcMacMask: value })}
                            aria-label="Source MAC mask"
                          />
                        </FlexItem>
                      </Flex>
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="Destination MAC" fieldId="access-dst-mac-check">
                        <Checkbox
                          id="access-dst-mac-check"
                          label="Match destination MAC"
                          isChecked={draft.checkDstMac}
                          onChange={(_event, checked) => setDraft({ checkDstMac: checked })}
                        />
                      </FormGroup>
                      <Flex gap={{ default: 'gapSm' }}>
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <TextInput
                            id="access-dst-mac"
                            value={draft.dstMac}
                            isDisabled={!draft.checkDstMac}
                            onChange={(_event, value) => setDraft({ dstMac: value })}
                            aria-label="Destination MAC address"
                          />
                        </FlexItem>
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <TextInput
                            id="access-dst-mac-mask"
                            value={draft.dstMacMask}
                            isDisabled={!draft.checkDstMac}
                            onChange={(_event, value) => setDraft({ dstMacMask: value })}
                            aria-label="Destination MAC mask"
                          />
                        </FlexItem>
                      </Flex>
                    </FlexItem>
                  </Flex>
                  {(draft.checkSrcMac || draft.checkDstMac) && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>
                          MAC addresses can use FF-FF-FF-FF-FF-FF, FF:FF:FF:FF:FF:FF, or FFFFFFFFFFFF format.
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </>
              )}

              {(caps.supportTcpState || caps.supportRedirect) && (
                <Flex gap={{ default: 'gapLg' }}>
                  {caps.supportTcpState && (
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="TCP state" fieldId="access-tcp-state">
                        <Checkbox
                          id="access-tcp-state"
                          label="Match TCP connection state"
                          isChecked={draft.checkTcpState}
                          isDisabled={!showTcpState}
                          onChange={(_event, checked) => setDraft({ checkTcpState: checked })}
                        />
                        <FormSelect
                          id="access-tcp-state-value"
                          value={draft.established ? 'established' : 'unestablished'}
                          isDisabled={!draft.checkTcpState || !showTcpState}
                          onChange={(_event, value) => setDraft({ established: value === 'established' })}
                          aria-label="TCP connection state"
                        >
                          <FormSelectOption value="established" label="Established" />
                          <FormSelectOption value="unestablished" label="Not established" />
                        </FormSelect>
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>TCP state matching is available only for TCP rules.</HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>
                    </FlexItem>
                  )}
                  {caps.supportRedirect && (
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="HTTP redirect URL" fieldId="access-redirect-enabled">
                        <Checkbox
                          id="access-redirect-enabled"
                          label="Redirect matching TCP connections"
                          isChecked={draft.redirectEnabled}
                          isDisabled={!allowPassEffects}
                          onChange={(_event, checked) => setDraft({ redirectEnabled: checked })}
                        />
                        <TextInput
                          id="access-redirect-url"
                          value={draft.redirectUrl}
                          isDisabled={!draft.redirectEnabled || !allowPassEffects}
                          onChange={(_event, value) => setDraft({ redirectUrl: value })}
                          aria-label="HTTP redirect URL"
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>
                              Redirects apply only to rules with the Pass action. The URL must start with http:// or
                              https://.
                            </HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>
                    </FlexItem>
                  )}
                </Flex>
              )}

              {caps.supportSimulation && (
                <>
                  <Flex gap={{ default: 'gapMd' }}>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="Delay (ms)" fieldId="access-delay">
                        <TextInput
                          id="access-delay"
                          type="number"
                          min={0}
                          max={MAX_DELAY}
                          value={draft.delay}
                          isDisabled={!allowPassEffects}
                          onChange={(_event, value) => setDraft({ delay: value })}
                          aria-label="Delay (ms)"
                        />
                      </FormGroup>
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="Jitter (%)" fieldId="access-jitter">
                        <TextInput
                          id="access-jitter"
                          type="number"
                          min={0}
                          max={MAX_PERCENT}
                          value={draft.jitter}
                          isDisabled={!allowPassEffects}
                          onChange={(_event, value) => setDraft({ jitter: value })}
                          aria-label="Jitter (%)"
                        />
                      </FormGroup>
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }}>
                      <FormGroup label="Packet loss (%)" fieldId="access-loss">
                        <TextInput
                          id="access-loss"
                          type="number"
                          min={0}
                          max={MAX_PERCENT}
                          value={draft.loss}
                          isDisabled={!allowPassEffects}
                          onChange={(_event, value) => setDraft({ loss: value })}
                          aria-label="Packet loss (%)"
                        />
                      </FormGroup>
                    </FlexItem>
                  </Flex>
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        Delay, jitter, and packet loss apply only to matching rules with the Pass action. Delay must be
                        0-10000 ms; jitter and packet loss must be 0-100 percent.
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </>
              )}
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={saveEditor} isDisabled={busy || validation.length > 0}>
            {editor?.mode === 'edit' ? 'Save' : 'Create'}
          </Button>
          <Button variant="link" onClick={() => setEditor(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        variant={ModalVariant.small}
        isOpen={pendingDelete !== null}
        onClose={() => !busy && setPendingDelete(null)}
      >
        <ModalHeader title="Delete rule" titleIconVariant="warning" />
        <ModalBody>Delete access list rule #{pendingDelete}?</ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDelete} isLoading={busy} isDisabled={busy}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingDelete(null)} isDisabled={busy}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Flex>
  );
};

export { AccessList };
