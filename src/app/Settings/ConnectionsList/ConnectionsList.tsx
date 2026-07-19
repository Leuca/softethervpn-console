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
import { AppPage } from '@app/components/AppPage';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { connectionTypeLabel, formatRpcValue } from '@app/utils/format';
import { useAutoRefresh } from '@app/utils/useAutoRefresh';

interface DetailState {
  name: string;
  info: Record<string, unknown> | null; // null while loading
  error: string | null;
}

// SoftEther returns error code 29 ("Object not found") when a connection has
// already closed - the common case for the short-lived management RPC
// connections, which close as soon as their request completes.
function isConnectionGoneError(error: string): boolean {
  return /code[=\s]*29\b/i.test(error) || /object not found/i.test(error);
}

const ConnectionsList: React.FunctionComponent = () => {
  const fetchConnections = React.useCallback(
    () => api.EnumConnection().then((response) => response.ConnectionList ?? []),
    [],
  );
  const { data: connections, error, refreshing, lastUpdated, load } = useAutoRefresh(fetchConnections);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DetailState | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState(false);

  const openDetail = (name: string) => {
    setDetail({ name, info: null, error: null });
    api
      .GetConnectionInfo(new VPN.VpnRpcConnectionInfo({ Name_str: name }))
      .then((response) => setDetail({ name, info: response as unknown as Record<string, unknown>, error: null }))
      .catch((e) => setDetail({ name, info: null, error: String(e) }));
  };

  const confirmDisconnect = () => {
    if (pendingDisconnect === null) {
      return;
    }
    const name = pendingDisconnect;
    setDisconnecting(true);
    setActionError(null);
    api
      .DisconnectConnection(new VPN.VpnRpcDisconnectConnection({ Name_str: name }))
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

  const isInitialLoading = connections === null && error === null;

  return (
    <AppPage
      title="TCP/IP Connections"
      description="Connections currently established to this VPN server's management and tunneling ports."
    >
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
              {refreshing && connections !== null
                ? 'Refreshing...'
                : lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString()}`
                  : 'Auto-refreshes every 10s'}
            </span>
          </FlexItem>
        </Flex>
        {(actionError ?? error) && (
          <Alert variant="danger" title="Could not load or update connections" isInline>
            {actionError ?? error}
          </Alert>
        )}
        {isInitialLoading ? (
          <Bullseye>
            <Spinner size="xl" aria-label="Loading connections" />
          </Bullseye>
        ) : connections !== null && connections.length === 0 ? (
          <EmptyState titleText="No active connections" headingLevel="h2">
            <EmptyStateBody>There are currently no TCP/IP connections to this server.</EmptyStateBody>
          </EmptyState>
        ) : connections !== null ? (
          <ScrollableTable aria-label="TCP/IP connections" variant="compact">
          <Thead>
            <Tr>
              <Th>Connection name</Th>
              <Th>Source</Th>
              <Th>Connected since</Th>
              <Th>Type</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {connections.map((conn) => (
              <Tr key={conn.Name_str}>
                <Td dataLabel="Connection name">{conn.Name_str}</Td>
                <Td dataLabel="Source">{`${conn.Hostname_str}:${conn.Port_u32}`}</Td>
                <Td dataLabel="Connected since">{formatRpcValue('ConnectedTime_dt', conn.ConnectedTime_dt)}</Td>
                <Td dataLabel="Type">{connectionTypeLabel(conn.Type_u32)}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      { title: 'Connection details', onClick: () => openDetail(conn.Name_str) },
                      { isSeparator: true },
                      { title: 'Disconnect', onClick: () => setPendingDisconnect(conn.Name_str) },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
          </ScrollableTable>
        ) : null}
      </Flex>

      <Modal variant={ModalVariant.medium} isOpen={detail !== null} onClose={() => setDetail(null)}>
        <ModalHeader title={detail ? `Connection: ${detail.name}` : ''} />
        <ModalBody>
          {detail?.error ? (
            isConnectionGoneError(detail.error) ? (
              <Alert variant="info" title="Connection no longer active" isInline>
                This connection has already closed, so its details are no longer available. Short-lived management
                connections close as soon as their request completes.
              </Alert>
            ) : (
              <Alert variant="danger" title="Could not load connection details" isInline>
                {detail.error}
              </Alert>
            )
          ) : detail?.info ? (
            <KeyValueTable data={detail.info} ariaLabel={`Details for ${detail.name}`} />
          ) : (
            <Bullseye>
              <Spinner size="lg" aria-label="Loading connection details" />
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
        variant={ModalVariant.small}
        isOpen={pendingDisconnect !== null}
        onClose={() => !disconnecting && setPendingDisconnect(null)}
      >
        <ModalHeader title="Disconnect connection" titleIconVariant="warning" />
        <ModalBody>
          Disconnect <strong>{pendingDisconnect}</strong>? The remote endpoint may reconnect automatically.
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
    </AppPage>
  );
};

export { ConnectionsList };
