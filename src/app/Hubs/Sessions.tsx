import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  ContentVariants,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { binToBytes } from '@app/utils/blob_utils';
import { formatRpcValue } from '@app/utils/format';

// GetSessionStatus returns many fields (including the inline security policy);
// show only the identity/connection ones the native session dialog surfaces.
const STATUS_KEYS = [
  'Username_str',
  'RealUsername_str',
  'GroupName_str',
  'Client_Ip_Address_ip',
  'SessionStatus_ClientHostName_str',
  'ServerName_str',
  'Connected_bool',
  'Active_bool',
  'LinkMode_bool',
];

// A session's location: remote sessions (cluster/cascade) name their server,
// local sessions are terminated on this server.
const sessionLocation = (s: VPN.VpnRpcEnumSessionItem): string =>
  s.RemoteSession_bool ? s.RemoteHostname_str || 'Remote' : 'Local';

// MacAddress_bin arrives as base64 (see blob_utils); render as AA:BB:...
const formatMac = (value: unknown): string => {
  const bytes = binToBytes(value);
  if (!bytes) {
    return '-';
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
};

interface DetailState {
  name: string;
  status: Record<string, unknown> | null;
  mac: VPN.VpnRpcEnumMacTableItem[];
  ip: VPN.VpnRpcEnumIpTableItem[];
  error: string | null;
}

const Sessions: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [sessions, setSessions] = React.useState<VPN.VpnRpcEnumSessionItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DetailState | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState(false);

  const load = React.useCallback(() => {
    setSessions(null);
    setError(null);
    api
      .EnumSession(new VPN.VpnRpcEnumSession({ HubName_str: hub }))
      .then((response) => setSessions(response.SessionList ?? []))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Load the session status plus this session's slice of the hub-wide MAC and
  // IP tables (both enumerate the whole hub, so filter by session name).
  const openDetail = (name: string) => {
    setDetail({ name, status: null, mac: [], ip: [], error: null });
    Promise.all([
      api.GetSessionStatus(new VPN.VpnRpcSessionStatus({ HubName_str: hub, Name_str: name })),
      api.EnumMacTable(new VPN.VpnRpcEnumMacTable({ HubName_str: hub })),
      api.EnumIpTable(new VPN.VpnRpcEnumIpTable({ HubName_str: hub })),
    ])
      .then(([status, macs, ips]) =>
        setDetail({
          name,
          status: status as unknown as Record<string, unknown>,
          mac: (macs.MacTable ?? []).filter((m) => m.SessionName_str === name),
          ip: (ips.IpTable ?? []).filter((i) => i.SessionName_str === name),
          error: null,
        }),
      )
      .catch((e) => setDetail({ name, status: null, mac: [], ip: [], error: String(e) }));
  };

  const confirmDisconnect = () => {
    if (pendingDisconnect === null) {
      return;
    }
    const name = pendingDisconnect;
    setDisconnecting(true);
    api
      .DeleteSession(new VPN.VpnRpcDeleteSession({ HubName_str: hub, Name_str: name }))
      .then(() => {
        setPendingDisconnect(null);
        setDisconnecting(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setPendingDisconnect(null);
        setDisconnecting(false);
      });
  };

  const isLoading = sessions === null && error === null;

  // Curated status subset (only the keys present in the response).
  const statusSubset = React.useMemo(() => {
    if (!detail?.status) {
      return null;
    }
    const subset: Record<string, unknown> = {};
    for (const key of STATUS_KEYS) {
      if (key in detail.status) {
        subset[key] = detail.status[key];
      }
    }
    return subset;
  }, [detail]);

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }}>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading}>
            Refresh
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="Session operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading sessions" />
        </Bullseye>
      ) : sessions !== null && sessions.length === 0 ? (
        <EmptyState titleText="No active sessions" headingLevel="h2">
          <EmptyStateBody>No VPN sessions are currently connected to this hub.</EmptyStateBody>
        </EmptyState>
      ) : sessions !== null ? (
        <Table aria-label="Sessions" variant="compact">
          <Thead>
            <Tr>
              <Th>Session name</Th>
              <Th>Location</Th>
              <Th>User</Th>
              <Th>Source host</Th>
              <Th>TCP</Th>
              <Th>Transfer</Th>
              <Th>VLAN</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {sessions.map((s) => (
              <Tr key={s.Name_str}>
                <Td dataLabel="Session name">{s.Name_str}</Td>
                <Td dataLabel="Location">{sessionLocation(s)}</Td>
                <Td dataLabel="User">{s.Username_str || '-'}</Td>
                <Td dataLabel="Source host">{s.Hostname_str || '-'}</Td>
                <Td dataLabel="TCP">{`${s.CurrentNumTcp_u32} / ${s.MaxNumTcp_u32}`}</Td>
                <Td dataLabel="Transfer">
                  {`${s.PacketSize_u64.toLocaleString()} bytes / ${s.PacketNum_u64.toLocaleString()} packets`}
                </Td>
                <Td dataLabel="VLAN">{s.VLanId_u32 ? s.VLanId_u32 : '-'}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      { title: 'Session details', onClick: () => openDetail(s.Name_str) },
                      { isSeparator: true },
                      { title: 'Disconnect', onClick: () => setPendingDisconnect(s.Name_str) },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}

      {/* Session details: status summary + this session's MAC and IP tables */}
      <Modal variant={ModalVariant.medium} isOpen={detail !== null} onClose={() => setDetail(null)}>
        <ModalHeader title={detail ? `Session: ${detail.name}` : ''} />
        <ModalBody>
          {detail?.error ? (
            <Alert variant="danger" title="Could not load session details" isInline>
              {detail.error}
            </Alert>
          ) : detail && statusSubset ? (
            <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
              <FlexItem>
                <KeyValueTable data={statusSubset} ariaLabel={`Status for ${detail.name}`} />
              </FlexItem>
              <FlexItem>
                <Content component={ContentVariants.h4}>MAC address table</Content>
                {detail.mac.length === 0 ? (
                  <Content component={ContentVariants.small}>No MAC addresses registered for this session.</Content>
                ) : (
                  <Table aria-label={`MAC table for ${detail.name}`} variant="compact">
                    <Thead>
                      <Tr>
                        <Th>MAC address</Th>
                        <Th>VLAN</Th>
                        <Th>Created</Th>
                        <Th>Updated</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {detail.mac.map((m) => (
                        <Tr key={m.Key_u32}>
                          <Td dataLabel="MAC address">{formatMac(m.MacAddress_bin)}</Td>
                          <Td dataLabel="VLAN">{m.VlanId_u32 ? m.VlanId_u32 : '-'}</Td>
                          <Td dataLabel="Created">{formatRpcValue('CreatedTime_dt', m.CreatedTime_dt)}</Td>
                          <Td dataLabel="Updated">{formatRpcValue('UpdatedTime_dt', m.UpdatedTime_dt)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </FlexItem>
              <FlexItem>
                <Content component={ContentVariants.h4}>IP address table</Content>
                {detail.ip.length === 0 ? (
                  <Content component={ContentVariants.small}>No IP addresses registered for this session.</Content>
                ) : (
                  <Table aria-label={`IP table for ${detail.name}`} variant="compact">
                    <Thead>
                      <Tr>
                        <Th>IP address</Th>
                        <Th>DHCP</Th>
                        <Th>Created</Th>
                        <Th>Updated</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {detail.ip.map((i) => (
                        <Tr key={i.Key_u32}>
                          <Td dataLabel="IP address">{i.IpAddress_ip}</Td>
                          <Td dataLabel="DHCP">{i.DhcpAllocated_bool ? 'Yes' : 'No'}</Td>
                          <Td dataLabel="Created">{formatRpcValue('CreatedTime_dt', i.CreatedTime_dt)}</Td>
                          <Td dataLabel="Updated">{formatRpcValue('UpdatedTime_dt', i.UpdatedTime_dt)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </FlexItem>
            </Flex>
          ) : (
            <Bullseye>
              <Spinner size="lg" aria-label="Loading session details" />
            </Bullseye>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={() => setDetail(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Disconnect confirmation */}
      <Modal
        variant={ModalVariant.small}
        isOpen={pendingDisconnect !== null}
        onClose={() => setPendingDisconnect(null)}
      >
        <ModalHeader title="Disconnect session" titleIconVariant="warning" />
        <ModalBody>
          Disconnect the session <strong>{pendingDisconnect}</strong>? The client may reconnect automatically.
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDisconnect} isLoading={disconnecting} isDisabled={disconnecting}>
            Disconnect
          </Button>
          <Button variant="link" onClick={() => setPendingDisconnect(null)} isDisabled={disconnecting}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Flex>
  );
};

export { Sessions };
