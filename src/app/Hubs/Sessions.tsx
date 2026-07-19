import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
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
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ScrollableTable } from '@app/components/ScrollableTable';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { HubTables } from '@app/Hubs/HubTables';
import { useAutoRefresh } from '@app/utils/useAutoRefresh';

type SessionTableKind = 'mac' | 'ip';

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

interface DetailState {
  name: string;
  status: Record<string, unknown> | null;
  error: string | null;
}

interface SessionTableState {
  name: string;
  kind: SessionTableKind;
}

const Sessions: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const fetchSessions = React.useCallback(
    () =>
      api.EnumSession(new VPN.VpnRpcEnumSession({ HubName_str: hub })).then((response) => response.SessionList ?? []),
    [hub],
  );
  const { data: sessions, error, refreshing, lastUpdated, load } = useAutoRefresh(fetchSessions);
  // Kept apart from the load error so an auto-refresh does not clear it.
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DetailState | null>(null);
  const [sessionTable, setSessionTable] = React.useState<SessionTableState | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState(false);

  const openDetail = (name: string) => {
    setDetail({ name, status: null, error: null });
    api
      .GetSessionStatus(new VPN.VpnRpcSessionStatus({ HubName_str: hub, Name_str: name }))
      .then((status) =>
        setDetail({
          name,
          status: status as unknown as Record<string, unknown>,
          error: null,
        }),
      )
      .catch((e) => setDetail({ name, status: null, error: String(e) }));
  };

  const confirmDisconnect = () => {
    if (pendingDisconnect === null) {
      return;
    }
    const name = pendingDisconnect;
    setDisconnecting(true);
    setActionError(null);
    api
      .DeleteSession(new VPN.VpnRpcDeleteSession({ HubName_str: hub, Name_str: name }))
      .then(() => {
        setPendingDisconnect(null);
        setDisconnecting(false);
        load();
      })
      .catch((e) => {
        setActionError(String(e));
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
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem>
          <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
            {refreshing && sessions !== null
              ? 'Refreshing...'
              : lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Auto-refreshes every 10s'}
          </span>
        </FlexItem>
      </Flex>

      {(actionError ?? error) && (
        <Alert variant="danger" title="Session operation failed" isInline>
          {actionError ?? error}
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
        <ScrollableTable aria-label="Sessions" variant="compact">
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
                      { title: 'MAC address table', onClick: () => setSessionTable({ name: s.Name_str, kind: 'mac' }) },
                      { title: 'IP address table', onClick: () => setSessionTable({ name: s.Name_str, kind: 'ip' }) },
                      { isSeparator: true },
                      { title: 'Disconnect', onClick: () => setPendingDisconnect(s.Name_str) },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </ScrollableTable>
      ) : null}

      {/* Session details: status summary only. Session MAC/IP tables open separately. */}
      <Modal variant={ModalVariant.medium} isOpen={detail !== null} onClose={() => setDetail(null)}>
        <ModalHeader title={detail ? `Session: ${detail.name}` : ''} />
        <ModalBody>
          {detail?.error ? (
            <Alert variant="danger" title="Could not load session details" isInline>
              {detail.error}
            </Alert>
          ) : detail && statusSubset ? (
            <KeyValueTable data={statusSubset} ariaLabel={`Status for ${detail.name}`} />
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

      <Modal
        variant={ModalVariant.large}
        isOpen={sessionTable !== null}
        onClose={() => setSessionTable(null)}
      >
        <ModalHeader
          title={
            sessionTable
              ? `${sessionTable.kind === 'mac' ? 'MAC address table' : 'IP address table'}: ${sessionTable.name}`
              : ''
          }
        />
        <ModalBody>
          {sessionTable && (
            <HubTables
              hub={hub}
              sessionName={sessionTable.name}
              singleKind={sessionTable.kind}
              confirmInline
            />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={() => setSessionTable(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Disconnect confirmation */}
      <Modal
        variant={ModalVariant.small}
        isOpen={pendingDisconnect !== null}
        onClose={() => !disconnecting && setPendingDisconnect(null)}
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
