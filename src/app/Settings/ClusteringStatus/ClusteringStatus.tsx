import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { CertificateModal } from '@app/CertificateViewer/CertificateViewer';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { binToBytes } from '@app/utils/blob_utils';
import { formatOptionalDate } from '@app/utils/format';

// Fields rendered outside the flat KeyValueTable (binary cert, or nested lists).
const FARM_INFO_OMIT = new Set(['ServerCert_bin', 'HubsList']);

interface MemberDetail {
  hostname: string;
  info: Record<string, unknown> | null; // null while loading
  hubs: VPN.VpnRpcFarmHub[];
  // The server cert as returned by the API (base64 string), normalized on use.
  cert: Uint8Array | string | null;
  error: string | null;
}

// The cluster controller view: the list of farm members it manages.
const ControllerView: React.FunctionComponent = () => {
  const [members, setMembers] = React.useState<VPN.VpnRpcEnumFarmItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<MemberDetail | null>(null);
  const [certOpen, setCertOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setMembers(null);
    setError(null);
    api
      .EnumFarmMember()
      .then((response) => setMembers(response.FarmMemberList ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const openDetail = (member: VPN.VpnRpcEnumFarmItem) => {
    setDetail({ hostname: member.Hostname_str, info: null, hubs: [], cert: null, error: null });
    api
      .GetFarmInfo(new VPN.VpnRpcFarmInfo({ Id_u32: member.Id_u32 }))
      .then((response) => {
        const info: Record<string, unknown> = {};
        Object.keys(response).forEach((key) => {
          if (!FARM_INFO_OMIT.has(key)) {
            info[key] = (response as unknown as Record<string, unknown>)[key];
          }
        });
        setDetail({
          hostname: member.Hostname_str,
          info,
          hubs: response.HubsList ?? [],
          cert: response.ServerCert_bin ?? null,
          error: null,
        });
      })
      .catch((e) =>
        setDetail({ hostname: member.Hostname_str, info: null, hubs: [], cert: null, error: String(e) }),
      );
  };

  const refresh = (
    <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={members === null && error === null}>
      Refresh
    </Button>
  );

  return (
    <AppPage title="Clustering Status" description="Members of the cluster this server controls." actions={refresh}>
      {error ? (
        <Alert variant="danger" title="Could not load cluster members" isInline>
          {error}
        </Alert>
      ) : members === null ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading cluster members" />
        </Bullseye>
      ) : members.length === 0 ? (
        <EmptyState titleText="No cluster members" headingLevel="h2">
          <EmptyStateBody>No servers have joined this cluster yet.</EmptyStateBody>
        </EmptyState>
      ) : (
        <Table aria-label="Cluster members" variant="compact">
          <Thead>
            <Tr>
              <Th>Type</Th>
              <Th>Host name</Th>
              <Th>Connection started</Th>
              <Th>Point</Th>
              <Th>Sessions</Th>
              <Th>TCP connections</Th>
              <Th>Operating hubs</Th>
              <Th>Client licenses</Th>
              <Th>Bridge licenses</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {members.map((member) => (
              <Tr key={member.Id_u32}>
                <Td dataLabel="Type">{member.Controller_bool ? 'Controller' : 'Member'}</Td>
                <Td dataLabel="Host name">{member.Hostname_str}</Td>
                <Td dataLabel="Connection started">{formatOptionalDate(member.ConnectedTime_dt, '-')}</Td>
                <Td dataLabel="Point">{member.Point_u32.toLocaleString()}</Td>
                <Td dataLabel="Sessions">{member.NumSessions_u32.toLocaleString()}</Td>
                <Td dataLabel="TCP connections">{member.NumTcpConnections_u32.toLocaleString()}</Td>
                <Td dataLabel="Operating hubs">{member.NumHubs_u32.toLocaleString()}</Td>
                <Td dataLabel="Client licenses">{member.AssignedClientLicense_u32.toLocaleString()}</Td>
                <Td dataLabel="Bridge licenses">{member.AssignedBridgeLicense_u32.toLocaleString()}</Td>
                <Td isActionCell>
                  <ActionsColumn items={[{ title: 'View details', onClick: () => openDetail(member) }]} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Modal variant={ModalVariant.medium} isOpen={detail !== null} onClose={() => setDetail(null)}>
        <ModalHeader title={detail ? `Member: ${detail.hostname}` : 'Member'} />
        <ModalBody>
          {detail?.error ? (
            <Alert variant="danger" title="Could not load member information" isInline>
              {detail.error}
            </Alert>
          ) : detail?.info == null ? (
            <Bullseye>
              <Spinner size="xl" aria-label="Loading member information" />
            </Bullseye>
          ) : (
            <Stack hasGutter>
              <StackItem>
                <KeyValueTable data={detail.info} ariaLabel="Member information" />
              </StackItem>
              {detail.hubs.length > 0 && (
                <StackItem>
                  <Content component="h3">Operating hubs</Content>
                  <LabelGroup numLabels={20}>
                    {detail.hubs.map((hub) => (
                      <Label key={hub.HubName_str} color={hub.DynamicHub_bool ? 'blue' : 'grey'}>
                        {hub.HubName_str} ({hub.DynamicHub_bool ? 'Dynamic' : 'Static'})
                      </Label>
                    ))}
                  </LabelGroup>
                </StackItem>
              )}
              <StackItem>
                <Button variant="secondary" onClick={() => setCertOpen(true)} isDisabled={binToBytes(detail.cert) === null}>
                  View server certificate
                </Button>
              </StackItem>
            </Stack>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={() => setDetail(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <CertificateModal certBin={detail?.cert ?? null} isOpen={certOpen} onClose={() => setCertOpen(false)} />
    </AppPage>
  );
};

// The cluster member view: this server's connection state to its controller.
const MemberView: React.FunctionComponent = () => {
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const load = React.useCallback(() => {
    setRefreshing(true);
    setError(null);
    api
      .GetFarmConnectionStatus()
      .then((response) => {
        setStatus(response as unknown as Record<string, unknown>);
        setLastUpdated(new Date());
      })
      .catch((e) => setError(String(e)))
      .finally(() => setRefreshing(false));
  }, []);

  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const isInitialLoading = status === null && error === null;

  return (
    <AppPage
      title="Clustering Status"
      description="This server's connection to its cluster controller."
    >
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
              {refreshing && status !== null
                ? 'Refreshing...'
                : lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString()}`
                  : 'Auto-refreshes every 10s'}
            </span>
          </FlexItem>
        </Flex>
        {error && (
          <Alert variant="danger" title="Could not load controller connection status" isInline>
            {error}
          </Alert>
        )}
        {isInitialLoading ? (
          <Bullseye>
            <Spinner size="xl" aria-label="Loading controller connection status" />
          </Bullseye>
        ) : status !== null ? (
          <KeyValueTable data={status} ariaLabel="Controller connection status" />
        ) : null}
      </Flex>
    </AppPage>
  );
};

const ClusteringStatus: React.FunctionComponent = () => {
  const [mode, setMode] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api
      .GetFarmSetting()
      .then((response) => setMode(response.ServerType_u32))
      .catch((e) => setError(String(e)));
  }, []);

  if (error !== null) {
    return (
      <AppPage title="Clustering Status">
        <Alert variant="danger" title="Could not determine the cluster role" isInline>
          {error}
        </Alert>
      </AppPage>
    );
  }

  if (mode === null) {
    return (
      <AppPage title="Clustering Status">
        <Bullseye>
          <Spinner size="xl" aria-label="Loading cluster role" />
        </Bullseye>
      </AppPage>
    );
  }

  if (mode === VPN.VpnRpcServerType.FarmController) {
    return <ControllerView />;
  }

  if (mode === VPN.VpnRpcServerType.FarmMember) {
    return <MemberView />;
  }

  return (
    <AppPage title="Clustering Status" description="This server is not part of a cluster.">
      <EmptyState titleText="Standalone server" headingLevel="h2">
        <EmptyStateBody>
          Clustering status is only available when this server runs as a cluster controller or member.
        </EmptyStateBody>
      </EmptyState>
    </AppPage>
  );
};

export { ClusteringStatus };
