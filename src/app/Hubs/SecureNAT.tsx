import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { useServer } from '@app/ServerContext';
import { binToBytes } from '@app/utils/blob_utils';
import { formatRpcValue } from '@app/utils/format';
import { api } from '@app/utils/vpnrpc_settings';

const MIN_MTU = 64;
const MAX_MTU = 1500;
const MIN_TCP_TIMEOUT = 60;
const MAX_TCP_TIMEOUT = 2000000;
const MIN_UDP_TIMEOUT = 10;
const MAX_UDP_TIMEOUT = 2000000;
const MIN_DHCP_EXPIRE = 15;

const protocolLabels: Record<number, string> = {
  [VPN.VpnRpcNatProtocol.TCP]: 'TCP',
  [VPN.VpnRpcNatProtocol.UDP]: 'UDP',
  [VPN.VpnRpcNatProtocol.DNS]: 'DNS',
  [VPN.VpnRpcNatProtocol.ICMP]: 'ICMP',
};

const tcpStateLabels: Record<number, string> = {
  [VPN.VpnRpcNatTcpState.Connecting]: 'Connecting',
  [VPN.VpnRpcNatTcpState.SendReset]: 'Reset sent',
  [VPN.VpnRpcNatTcpState.Connected]: 'Connected',
  [VPN.VpnRpcNatTcpState.Established]: 'Established',
  [VPN.VpnRpcNatTcpState.WaitDisconnect]: 'Disconnecting',
};

interface RuntimeState {
  status: VPN.VpnRpcNatStatus | null;
  nat: VPN.VpnRpcEnumNatItem[];
  dhcp: VPN.VpnRpcEnumDhcpItem[];
}

const capValue = (capsList: unknown[], name: string): number | null => {
  const cap = capsList.find((item) => (item as VPN.VpnCaps).CapsName_str === name) as VPN.VpnCaps | undefined;
  return cap ? cap.CapsValue_u32 : null;
};

const capBool = (capsList: unknown[], name: string): boolean => capValue(capsList, name) !== 0;

const formatMac = (value: unknown): string => {
  const bytes = binToBytes(value);
  if (!bytes) {
    return '';
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
};

const parseMac = (value: string): Uint8Array | null => {
  const normalized = value.replace(/[-:.\s]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(normalized)) {
    return null;
  }
  return Uint8Array.from(normalized.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
};

const isValidIpv4 = (value: string): boolean => {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d+$/.test(part)) {
        return false;
      }
      const n = Number(part);
      return n >= 0 && n <= 255 && String(n) === part;
    })
  );
};

const isValidHostIpv4 = (value: string): boolean => {
  if (!isValidIpv4(value)) {
    return false;
  }
  const last = Number(value.split('.')[3]);
  return value !== '0.0.0.0' && value !== '255.255.255.255' && last !== 0 && last !== 255;
};

const isValidOptionalIpv4 = (value: string): boolean => value === '' || value === '0.0.0.0' || isValidIpv4(value);

const isValidSubnetMask = (value: string): boolean => {
  if (!isValidIpv4(value) || value === '0.0.0.0') {
    return false;
  }
  const asNumber = value
    .split('.')
    .map((part) => Number(part))
    .reduce((acc, part) => (acc << 8) + part, 0);
  const inverted = (~asNumber) >>> 0;
  return (inverted & (inverted + 1)) === 0;
};

const ipv4ToNumber = (value: string): number =>
  value
    .split('.')
    .map((part) => Number(part))
    .reduce((acc, part) => (acc << 8) + part, 0) >>> 0;

const optionalIpForSave = (value: unknown): string => {
  const stringValue = String(value ?? '').trim();
  return stringValue === '' ? '0.0.0.0' : stringValue;
};

const numberField = (config: Record<string, unknown>, key: string): number => Number(config[key] ?? 0);

const fieldText = (config: Record<string, unknown>, key: string): string => String(config[key] ?? '');

const normalizeSecureNatOption = (option: Record<string, unknown>): Record<string, unknown> => ({
  ...option,
  DhcpDnsServerAddress2_ip:
    option.DhcpDnsServerAddress2_ip === '::' || option.DhcpDnsServerAddress2_ip === '0.0.0.0'
      ? ''
      : option.DhcpDnsServerAddress2_ip,
});

const validationErrors = (config: Record<string, unknown>, mac: string): string[] => {
  const errors: string[] = [];

  if (!parseMac(mac)) {
    errors.push('Enter a 6-byte MAC address.');
  }
  if (!isValidHostIpv4(fieldText(config, 'Ip_ip'))) {
    errors.push('Enter a valid virtual host IP address.');
  }
  if (!isValidSubnetMask(fieldText(config, 'Mask_ip'))) {
    errors.push('Enter a valid virtual host subnet mask.');
  }

  if (config.UseNat_bool) {
    const mtu = numberField(config, 'Mtu_u32');
    const tcp = numberField(config, 'NatTcpTimeout_u32');
    const udp = numberField(config, 'NatUdpTimeout_u32');
    if (mtu < MIN_MTU || mtu > MAX_MTU) {
      errors.push(`MTU must be between ${MIN_MTU} and ${MAX_MTU}.`);
    }
    if (tcp < MIN_TCP_TIMEOUT || tcp > MAX_TCP_TIMEOUT) {
      errors.push(`TCP timeout must be between ${MIN_TCP_TIMEOUT} and ${MAX_TCP_TIMEOUT} seconds.`);
    }
    if (udp < MIN_UDP_TIMEOUT || udp > MAX_UDP_TIMEOUT) {
      errors.push(`UDP timeout must be between ${MIN_UDP_TIMEOUT} and ${MAX_UDP_TIMEOUT} seconds.`);
    }
  }

  if (config.UseDhcp_bool) {
    const start = fieldText(config, 'DhcpLeaseIPStart_ip');
    const end = fieldText(config, 'DhcpLeaseIPEnd_ip');
    const mask = fieldText(config, 'DhcpSubnetMask_ip');
    if (!isValidHostIpv4(start)) {
      errors.push('Enter a valid DHCP lease start IP address.');
    }
    if (!isValidHostIpv4(end)) {
      errors.push('Enter a valid DHCP lease end IP address.');
    }
    if (isValidHostIpv4(start) && isValidHostIpv4(end) && ipv4ToNumber(start) > ipv4ToNumber(end)) {
      errors.push('DHCP lease start must be before the lease end.');
    }
    if (!isValidSubnetMask(mask)) {
      errors.push('Enter a valid DHCP subnet mask.');
    }
    if (numberField(config, 'DhcpExpireTimeSpan_u32') < MIN_DHCP_EXPIRE) {
      errors.push(`DHCP lease time must be at least ${MIN_DHCP_EXPIRE} seconds.`);
    }
    for (const [key, label] of [
      ['DhcpGatewayAddress_ip', 'DHCP gateway'],
      ['DhcpDnsServerAddress_ip', 'Primary DNS server'],
      ['DhcpDnsServerAddress2_ip', 'Secondary DNS server'],
    ]) {
      if (!isValidOptionalIpv4(fieldText(config, key))) {
        errors.push(`${label} must be blank or a valid IPv4 address.`);
      }
    }
  }

  return errors;
};

const SecureNAT: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const { capsList, hideNonCluster } = useServer();
  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [runtime, setRuntime] = React.useState<RuntimeState>({ status: null, nat: [], dhcp: [] });
  const [mac, setMac] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [confirmEnable, setConfirmEnable] = React.useState(false);

  const virtualNatDisabled = capValue(capsList, 'b_virtual_nat_disabled') === 1;
  const pushRoutesSupported = capBool(capsList, 'b_suppport_push_route_config');

  const load = React.useCallback(() => {
    setConfig(null);
    setRuntime({ status: null, nat: [], dhcp: [] });
    setError(null);

    Promise.all([
      api.GetHubStatus(new VPN.VpnRpcHubStatus({ HubName_str: hub })),
      api.GetSecureNATOption(new VPN.VpnVhOption({ RpcHubName_str: hub })),
    ])
      .then(([hubStatus, secureNatOption]) => {
        const currentEnabled = Boolean(hubStatus.SecureNATEnabled_bool);
        const option = normalizeSecureNatOption(secureNatOption as unknown as Record<string, unknown>);
        setEnabled(currentEnabled);
        setConfig(option);
        setMac(formatMac(option.MacAddress_bin));

        if (!currentEnabled) {
          return;
        }

        return Promise.all([
          api.GetSecureNATStatus(new VPN.VpnRpcNatStatus({ HubName_str: hub })),
          api.EnumNAT(new VPN.VpnRpcEnumNat({ HubName_str: hub })),
          api.EnumDHCP(new VPN.VpnRpcEnumDhcp({ HubName_str: hub })),
        ]).then(([status, nat, dhcp]) =>
          setRuntime({
            status,
            nat: nat.NatTable ?? [],
            dhcp: dhcp.DhcpTable ?? [],
          }),
        );
      })
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  const setField = (key: string, value: unknown) => setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));

  const errors = config ? validationErrors(config, mac) : [];
  const isLoading = config === null && error === null;
  const canSave = config !== null && errors.length === 0 && !saving && !hideNonCluster;

  const save = () => {
    if (!config) {
      return;
    }
    const macBytes = parseMac(mac);
    if (!macBytes) {
      return;
    }

    setSaving(true);
    const obj = new VPN.VpnVhOption(config as Partial<VPN.VpnVhOption>);
    obj.RpcHubName_str = hub;
    obj.MacAddress_bin = macBytes;
    obj.DhcpGatewayAddress_ip = optionalIpForSave(obj.DhcpGatewayAddress_ip);
    obj.DhcpDnsServerAddress_ip = optionalIpForSave(obj.DhcpDnsServerAddress_ip);
    obj.DhcpDnsServerAddress2_ip = optionalIpForSave(obj.DhcpDnsServerAddress2_ip);
    obj.ApplyDhcpPushRoutes_bool = pushRoutesSupported;
    if (!pushRoutesSupported) {
      obj.DhcpPushRoutes_str = '';
    }

    api
      .SetSecureNATOption(obj)
      .then(() => {
        setSaving(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const setSecureNatEnabled = (nextEnabled: boolean) => {
    setToggling(true);
    setConfirmEnable(false);
    const payload = new VPN.VpnRpcHub({ HubName_str: hub });
    const call = nextEnabled ? api.EnableSecureNAT(payload) : api.DisableSecureNAT(payload);
    call
      .then(() => {
        setToggling(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setToggling(false);
      });
  };

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading || saving}>
            Refresh
          </Button>
        </FlexItem>
        <FlexItem>
          {enabled ? (
            <Button
              variant="secondary"
              onClick={() => setSecureNatEnabled(false)}
              isDisabled={isLoading || toggling || hideNonCluster}
              isLoading={toggling}
            >
              Disable Secure NAT
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setConfirmEnable(true)}
              isDisabled={isLoading || toggling || hideNonCluster}
              isLoading={toggling}
            >
              Enable Secure NAT
            </Button>
          )}
        </FlexItem>
        <FlexItem>
          <Button variant="primary" onClick={save} isDisabled={!canSave} isLoading={saving}>
            Save
          </Button>
        </FlexItem>
      </Flex>

      {hideNonCluster && (
        <Alert variant="warning" title="Secure NAT is not available on cluster servers" isInline />
      )}

      {error && (
        <Alert variant="danger" title="Secure NAT operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading Secure NAT settings" />
        </Bullseye>
      ) : config !== null ? (
        <>
          <Alert variant={enabled ? 'success' : 'info'} title={enabled ? 'Secure NAT is enabled' : 'Secure NAT is disabled'} isInline />

          {errors.length > 0 && (
            <Alert variant="danger" title="Fix Secure NAT settings before saving" isInline>
              <ul>
                {errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Form>
            <Content component="h2">Virtual host</Content>
            <Grid hasGutter>
              <GridItem span={12} md={6}>
                <FormGroup label="MAC address" fieldId="securenat-mac">
                  <TextInput
                    id="securenat-mac"
                    value={mac}
                    onChange={(_event, value) => setMac(value)}
                    validated={parseMac(mac) ? 'default' : 'error'}
                    aria-label="MAC address"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={6}>
                <FormGroup label="IP address" fieldId="securenat-ip">
                  <TextInput
                    id="securenat-ip"
                    value={fieldText(config, 'Ip_ip')}
                    onChange={(_event, value) => setField('Ip_ip', value)}
                    validated={isValidHostIpv4(fieldText(config, 'Ip_ip')) ? 'default' : 'error'}
                    aria-label="IP address"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={6}>
                <FormGroup label="Subnet mask" fieldId="securenat-mask">
                  <TextInput
                    id="securenat-mask"
                    value={fieldText(config, 'Mask_ip')}
                    onChange={(_event, value) => setField('Mask_ip', value)}
                    validated={isValidSubnetMask(fieldText(config, 'Mask_ip')) ? 'default' : 'error'}
                    aria-label="Subnet mask"
                  />
                </FormGroup>
              </GridItem>
            </Grid>

            <Content component="h2">Virtual NAT</Content>
            {virtualNatDisabled && <Alert variant="info" title="This server does not support Virtual NAT" isInline />}
            <Grid hasGutter>
              <GridItem span={12}>
                <FormGroup fieldId="securenat-use-nat">
                  <Checkbox
                    id="securenat-use-nat"
                    label="Use Virtual NAT function"
                    isChecked={Boolean(config.UseNat_bool)}
                    isDisabled={virtualNatDisabled}
                    onChange={(_event, checked) => setField('UseNat_bool', checked)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={4}>
                <FormGroup label="MTU" fieldId="securenat-mtu">
                  <TextInput
                    type="number"
                    id="securenat-mtu"
                    min={MIN_MTU}
                    max={MAX_MTU}
                    value={String(config.Mtu_u32 ?? 0)}
                    isDisabled={!config.UseNat_bool || virtualNatDisabled}
                    onChange={(_event, value) => setField('Mtu_u32', Number(value) || 0)}
                    aria-label="MTU"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={4}>
                <FormGroup label="TCP timeout (seconds)" fieldId="securenat-tcp-timeout">
                  <TextInput
                    type="number"
                    id="securenat-tcp-timeout"
                    min={MIN_TCP_TIMEOUT}
                    max={MAX_TCP_TIMEOUT}
                    value={String(config.NatTcpTimeout_u32 ?? 0)}
                    isDisabled={!config.UseNat_bool || virtualNatDisabled}
                    onChange={(_event, value) => setField('NatTcpTimeout_u32', Number(value) || 0)}
                    aria-label="TCP timeout (seconds)"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={4}>
                <FormGroup label="UDP timeout (seconds)" fieldId="securenat-udp-timeout">
                  <TextInput
                    type="number"
                    id="securenat-udp-timeout"
                    min={MIN_UDP_TIMEOUT}
                    max={MAX_UDP_TIMEOUT}
                    value={String(config.NatUdpTimeout_u32 ?? 0)}
                    isDisabled={!config.UseNat_bool || virtualNatDisabled}
                    onChange={(_event, value) => setField('NatUdpTimeout_u32', Number(value) || 0)}
                    aria-label="UDP timeout (seconds)"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12}>
                <FormGroup fieldId="securenat-save-log">
                  <Checkbox
                    id="securenat-save-log"
                    label="Save Virtual NAT and DHCP operations to the security log"
                    isChecked={Boolean(config.SaveLog_bool)}
                    onChange={(_event, checked) => setField('SaveLog_bool', checked)}
                  />
                </FormGroup>
              </GridItem>
            </Grid>

            <Content component="h2">Virtual DHCP</Content>
            <Grid hasGutter>
              <GridItem span={12}>
                <FormGroup fieldId="securenat-use-dhcp">
                  <Checkbox
                    id="securenat-use-dhcp"
                    label="Use Virtual DHCP server function"
                    isChecked={Boolean(config.UseDhcp_bool)}
                    onChange={(_event, checked) => setField('UseDhcp_bool', checked)}
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={6}>
                <FormGroup label="Lease start IP address" fieldId="securenat-dhcp-start">
                  <TextInput
                    id="securenat-dhcp-start"
                    value={fieldText(config, 'DhcpLeaseIPStart_ip')}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpLeaseIPStart_ip', value)}
                    aria-label="Lease start IP address"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={6}>
                <FormGroup label="Lease end IP address" fieldId="securenat-dhcp-end">
                  <TextInput
                    id="securenat-dhcp-end"
                    value={fieldText(config, 'DhcpLeaseIPEnd_ip')}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpLeaseIPEnd_ip', value)}
                    aria-label="Lease end IP address"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={6}>
                <FormGroup label="DHCP subnet mask" fieldId="securenat-dhcp-mask">
                  <TextInput
                    id="securenat-dhcp-mask"
                    value={fieldText(config, 'DhcpSubnetMask_ip')}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpSubnetMask_ip', value)}
                    aria-label="DHCP subnet mask"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={6}>
                <FormGroup label="Lease time (seconds)" fieldId="securenat-dhcp-expire">
                  <TextInput
                    type="number"
                    id="securenat-dhcp-expire"
                    min={MIN_DHCP_EXPIRE}
                    value={String(config.DhcpExpireTimeSpan_u32 ?? 0)}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpExpireTimeSpan_u32', Number(value) || 0)}
                    aria-label="Lease time (seconds)"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={4}>
                <FormGroup label="Gateway address" fieldId="securenat-dhcp-gateway">
                  <TextInput
                    id="securenat-dhcp-gateway"
                    value={fieldText(config, 'DhcpGatewayAddress_ip')}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpGatewayAddress_ip', value)}
                    aria-label="Gateway address"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={4}>
                <FormGroup label="Primary DNS server" fieldId="securenat-dhcp-dns">
                  <TextInput
                    id="securenat-dhcp-dns"
                    value={fieldText(config, 'DhcpDnsServerAddress_ip')}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpDnsServerAddress_ip', value)}
                    aria-label="Primary DNS server"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12} md={4}>
                <FormGroup label="Secondary DNS server" fieldId="securenat-dhcp-dns2">
                  <TextInput
                    id="securenat-dhcp-dns2"
                    value={fieldText(config, 'DhcpDnsServerAddress2_ip')}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpDnsServerAddress2_ip', value)}
                    aria-label="Secondary DNS server"
                  />
                </FormGroup>
              </GridItem>
              <GridItem span={12}>
                <FormGroup label="Domain name" fieldId="securenat-dhcp-domain">
                  <TextInput
                    id="securenat-dhcp-domain"
                    value={fieldText(config, 'DhcpDomainName_str')}
                    isDisabled={!config.UseDhcp_bool}
                    onChange={(_event, value) => setField('DhcpDomainName_str', value)}
                    aria-label="Domain name"
                  />
                </FormGroup>
              </GridItem>
              {pushRoutesSupported && (
                <GridItem span={12}>
                  <FormGroup label="Static routes to push" fieldId="securenat-dhcp-routes">
                    <TextArea
                      id="securenat-dhcp-routes"
                      value={fieldText(config, 'DhcpPushRoutes_str')}
                      isDisabled={!config.UseDhcp_bool}
                      onChange={(_event, value) => setField('DhcpPushRoutes_str', value)}
                      aria-label="Static routes to push"
                      resizeOrientation="vertical"
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>Use network/subnet/gateway entries separated by commas or spaces.</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>
                </GridItem>
              )}
            </Grid>
          </Form>

          {enabled && (
            <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
              <Content component="h2">Operating status</Content>
              {runtime.status ? (
                <KeyValueTable data={runtime.status as unknown as Record<string, unknown>} ariaLabel="Secure NAT status" />
              ) : (
                <Bullseye>
                  <Spinner size="lg" aria-label="Loading Secure NAT status" />
                </Bullseye>
              )}

              <Content component="h2">NAT table</Content>
              {runtime.nat.length === 0 ? (
                <EmptyState titleText="No NAT sessions" headingLevel="h3">
                  <EmptyStateBody>No Virtual NAT sessions are currently active.</EmptyStateBody>
                </EmptyState>
              ) : (
                <Table aria-label="NAT table" variant="compact">
                  <Thead>
                    <Tr>
                      <Th>ID</Th>
                      <Th>Protocol</Th>
                      <Th>Source</Th>
                      <Th>Destination</Th>
                      <Th>Last communication</Th>
                      <Th>Transfer</Th>
                      <Th>TCP state</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {runtime.nat.map((item) => (
                      <Tr key={item.Id_u32}>
                        <Td dataLabel="ID">{item.Id_u32}</Td>
                        <Td dataLabel="Protocol">{protocolLabels[item.Protocol_u32] ?? `Protocol ${item.Protocol_u32}`}</Td>
                        <Td dataLabel="Source">{`${item.SrcIp_ip}:${item.SrcPort_u32}`}</Td>
                        <Td dataLabel="Destination">{`${item.DestIp_ip}:${item.DestPort_u32}`}</Td>
                        <Td dataLabel="Last communication">{formatRpcValue('LastCommTime_dt', item.LastCommTime_dt)}</Td>
                        <Td dataLabel="Transfer">{`${item.SendSize_u64.toLocaleString()} sent / ${item.RecvSize_u64.toLocaleString()} received`}</Td>
                        <Td dataLabel="TCP state">{tcpStateLabels[item.TcpStatus_u32] ?? '-'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}

              <Content component="h2">DHCP leases</Content>
              {runtime.dhcp.length === 0 ? (
                <EmptyState titleText="No DHCP leases" headingLevel="h3">
                  <EmptyStateBody>No DHCP clients currently have leases from Secure NAT.</EmptyStateBody>
                </EmptyState>
              ) : (
                <Table aria-label="DHCP leases" variant="compact">
                  <Thead>
                    <Tr>
                      <Th>ID</Th>
                      <Th>MAC address</Th>
                      <Th>IP address</Th>
                      <Th>Hostname</Th>
                      <Th>Leased</Th>
                      <Th>Expires</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {runtime.dhcp.map((item) => (
                      <Tr key={item.Id_u32}>
                        <Td dataLabel="ID">{item.Id_u32}</Td>
                        <Td dataLabel="MAC address">{formatMac(item.MacAddress_bin)}</Td>
                        <Td dataLabel="IP address">{item.IpAddress_ip}</Td>
                        <Td dataLabel="Hostname">{item.Hostname_str || '-'}</Td>
                        <Td dataLabel="Leased">{formatRpcValue('LeasedTime_dt', item.LeasedTime_dt)}</Td>
                        <Td dataLabel="Expires">{formatRpcValue('ExpireTime_dt', item.ExpireTime_dt)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Flex>
          )}
        </>
      ) : null}

      <Modal
        variant={ModalVariant.small}
        isOpen={confirmEnable}
        onClose={() => setConfirmEnable(false)}
        aria-label="Enable Secure NAT"
      >
        <ModalHeader title="Enable Secure NAT" />
        <ModalBody>
          Secure NAT starts a virtual NAT router and DHCP server inside this Virtual Hub. Enable it only when the
          network settings are intentional.
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={() => setSecureNatEnabled(true)} isLoading={toggling}>
            Enable
          </Button>
          <Button variant="link" onClick={() => setConfirmEnable(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Flex>
  );
};

export { SecureNAT };
