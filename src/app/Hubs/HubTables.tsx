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
  Tab,
  TabTitleText,
  Tabs,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { formatMacAddress, formatRpcValue } from '@app/utils/format';
import { api } from '@app/utils/vpnrpc_settings';
import { useAutoRefresh } from '@app/utils/useAutoRefresh';

type TableKind = 'mac' | 'ip';

interface PendingDelete {
  kind: TableKind;
  key: number;
  label: string;
}

interface HubTablesProps {
  hub: string;
  sessionName?: string;
  singleKind?: TableKind;
  initialTab?: TableKind;
  confirmInline?: boolean;
}

const entryLocation = (remote: boolean, hostname: string): string => (remote ? hostname || 'Remote' : 'Local');

const HubTables: React.FunctionComponent<HubTablesProps> = ({
  hub,
  sessionName,
  singleKind,
  initialTab = 'mac',
  confirmInline = false,
}) => {
  const fetchTables = React.useCallback(
    () =>
      Promise.all([
        api.EnumMacTable(new VPN.VpnRpcEnumMacTable({ HubName_str: hub })),
        api.EnumIpTable(new VPN.VpnRpcEnumIpTable({ HubName_str: hub })),
      ]).then(([macResponse, ipResponse]) => {
        const macTable = macResponse.MacTable ?? [];
        const ipTable = ipResponse.IpTable ?? [];
        return {
          mac: sessionName ? macTable.filter((entry) => entry.SessionName_str === sessionName) : macTable,
          ip: sessionName ? ipTable.filter((entry) => entry.SessionName_str === sessionName) : ipTable,
        };
      }),
    [hub, sessionName],
  );
  const { data: tables, error, refreshing, lastUpdated, load } = useAutoRefresh(fetchTables);
  const mac = tables?.mac ?? null;
  const ip = tables?.ip ?? null;
  // Kept apart from the load error so an auto-refresh does not clear it.
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TableKind>(singleKind ?? initialTab);
  const [pendingDelete, setPendingDelete] = React.useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const entry = pendingDelete;
    setDeleting(true);
    setActionError(null);
    const payload = new VPN.VpnRpcDeleteTable({ HubName_str: hub, Key_u32: entry.key });
    const request = entry.kind === 'mac' ? api.DeleteMacTable(payload) : api.DeleteIpTable(payload);
    request
      .then(() => {
        setPendingDelete(null);
        setDeleting(false);
        load();
      })
      .catch((e) => {
        setActionError(String(e));
        setPendingDelete(null);
        setDeleting(false);
      });
  };

  const isInitialLoading = mac === null && ip === null && error === null;
  const scopedText = sessionName ? ' for this session' : ' for this hub';

  const confirmMessage = pendingDelete ? (
    <>
      Delete the {pendingDelete.kind === 'ip' ? 'IP' : 'MAC'} table entry <strong>{pendingDelete.label}</strong>?
    </>
  ) : null;

  const macTable = (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }} style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}>
      {mac !== null && mac.length === 0 ? (
        <EmptyState titleText="No MAC addresses" headingLevel="h2">
          <EmptyStateBody>No MAC addresses are currently registered{scopedText}.</EmptyStateBody>
        </EmptyState>
      ) : mac !== null ? (
        <Table aria-label={sessionName ? `Session MAC address table for ${sessionName}` : 'Hub MAC address table'} variant="compact">
          <Thead>
            <Tr>
              <Th>Session name</Th>
              <Th>VLAN</Th>
              <Th>MAC address</Th>
              <Th>Created</Th>
              <Th>Updated</Th>
              <Th>Location</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {mac.map((entry) => {
              const address = formatMacAddress(entry.MacAddress_bin);
              return (
                <Tr key={entry.Key_u32}>
                  <Td dataLabel="Session name">{entry.SessionName_str || '-'}</Td>
                  <Td dataLabel="VLAN">{entry.VlanId_u32 ? entry.VlanId_u32 : '-'}</Td>
                  <Td dataLabel="MAC address">{address}</Td>
                  <Td dataLabel="Created">{formatRpcValue('CreatedTime_dt', entry.CreatedTime_dt)}</Td>
                  <Td dataLabel="Updated">{formatRpcValue('UpdatedTime_dt', entry.UpdatedTime_dt)}</Td>
                  <Td dataLabel="Location">{entryLocation(entry.RemoteItem_bool, entry.RemoteHostname_str)}</Td>
                  <Td isActionCell>
                    <ActionsColumn
                      items={[
                        {
                          title: 'Delete',
                          onClick: () => setPendingDelete({ kind: 'mac', key: entry.Key_u32, label: address }),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      ) : null}
    </Flex>
  );

  const ipTable = (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }} style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}>
      {ip !== null && ip.length === 0 ? (
        <EmptyState titleText="No IP addresses" headingLevel="h2">
          <EmptyStateBody>No IP addresses are currently registered{scopedText}.</EmptyStateBody>
        </EmptyState>
      ) : ip !== null ? (
        <Table aria-label={sessionName ? `Session IP address table for ${sessionName}` : 'Hub IP address table'} variant="compact">
          <Thead>
            <Tr>
              <Th>Session name</Th>
              <Th>IP address</Th>
              <Th>DHCP</Th>
              <Th>Created</Th>
              <Th>Updated</Th>
              <Th>Location</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {ip.map((entry) => (
              <Tr key={entry.Key_u32}>
                <Td dataLabel="Session name">{entry.SessionName_str || '-'}</Td>
                <Td dataLabel="IP address">{entry.IpAddress_ip || '-'}</Td>
                <Td dataLabel="DHCP">{entry.DhcpAllocated_bool ? 'Yes' : 'No'}</Td>
                <Td dataLabel="Created">{formatRpcValue('CreatedTime_dt', entry.CreatedTime_dt)}</Td>
                <Td dataLabel="Updated">{formatRpcValue('UpdatedTime_dt', entry.UpdatedTime_dt)}</Td>
                <Td dataLabel="Location">{entryLocation(entry.RemoteItem_bool, entry.RemoteHostname_str)}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      {
                        title: 'Delete',
                        onClick: () =>
                          setPendingDelete({
                            kind: 'ip',
                            key: entry.Key_u32,
                            label: entry.IpAddress_ip || `key ${entry.Key_u32}`,
                          }),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}
    </Flex>
  );

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem>
          <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
            {refreshing && mac !== null && ip !== null
              ? 'Refreshing...'
              : lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Auto-refreshes every 10s'}
          </span>
        </FlexItem>
      </Flex>

      {(actionError ?? error) && (
        <Alert variant="danger" title="Address table operation failed" isInline>
          {actionError ?? error}
        </Alert>
      )}

      {pendingDelete && confirmInline && (
        <Alert variant="warning" title={confirmMessage} isInline>
          <Flex gap={{ default: 'gapSm' }} style={{ marginBlockStart: 'var(--pf-t--global--spacer--sm)' }}>
            <FlexItem>
              <Button variant="danger" onClick={confirmDelete} isLoading={deleting} isDisabled={deleting}>
                Delete
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="link" onClick={() => setPendingDelete(null)} isDisabled={deleting}>
                Cancel
              </Button>
            </FlexItem>
          </Flex>
        </Alert>
      )}

      {isInitialLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading address tables" />
        </Bullseye>
      ) : singleKind === 'mac' ? (
        macTable
      ) : singleKind === 'ip' ? (
        ipTable
      ) : (
        <Tabs activeKey={activeTab} onSelect={(_event, key) => setActiveTab(String(key) as TableKind)}>
          <Tab eventKey="mac" title={<TabTitleText>MAC address table</TabTitleText>}>
            {macTable}
          </Tab>
          <Tab eventKey="ip" title={<TabTitleText>IP address table</TabTitleText>}>
            {ipTable}
          </Tab>
        </Tabs>
      )}

      <Modal
        variant={ModalVariant.small}
        isOpen={pendingDelete !== null && !confirmInline}
        onClose={() => setPendingDelete(null)}
      >
        <ModalHeader
          title={pendingDelete?.kind === 'ip' ? 'Delete IP table entry' : 'Delete MAC table entry'}
          titleIconVariant="warning"
        />
        <ModalBody>{confirmMessage}</ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDelete} isLoading={deleting} isDisabled={deleting}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingDelete(null)} isDisabled={deleting}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Flex>
  );
};

export { HubTables };
