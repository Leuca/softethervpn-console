import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  HelperText,
  HelperTextItem,
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
import { KeyValueTable } from '@app/components/KeyValueTable';
import { formatOptionalDate } from '@app/utils/format';

// Fields rendered outside the flat KeyValueTable (binary cert, or nested lists).
const FARM_INFO_OMIT = new Set(['ServerCert_bin', 'HubsList']);

interface MemberDetail {
  hostname: string;
  info: Record<string, unknown> | null; // null while loading
  hubs: VPN.VpnRpcFarmHub[];
  error: string | null;
}

// The cluster controller view: the list of farm members it manages.
const ControllerView: React.FunctionComponent = () => {
  const [members, setMembers] = React.useState<VPN.VpnRpcEnumFarmItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<MemberDetail | null>(null);

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
    setDetail({ hostname: member.Hostname_str, info: null, hubs: [], error: null });
    api
      .GetFarmInfo(new VPN.VpnRpcFarmInfo({ Id_u32: member.Id_u32 }))
      .then((response) => {
        const info: Record<string, unknown> = {};
        Object.keys(response).forEach((key) => {
          if (!FARM_INFO_OMIT.has(key)) {
            info[key] = (response as unknown as Record<string, unknown>)[key];
          }
        });
        setDetail({ hostname: member.Hostname_str, info, hubs: response.HubsList ?? [], error: null });
      })
      .catch((e) => setDetail({ hostname: member.Hostname_str, info: null, hubs: [], error: String(e) }));
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
                <HelperText>
                  <HelperTextItem>Server certificate viewing is not available yet.</HelperTextItem>
                </HelperText>
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
    </AppPage>
  );
};

// The cluster member view: this server's connection state to its controller.
const MemberView: React.FunctionComponent = () => {
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setStatus(null);
    setError(null);
    api
      .GetFarmConnectionStatus()
      .then((response) => setStatus(response as unknown as Record<string, unknown>))
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const refresh = (
    <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={status === null && error === null}>
      Refresh
    </Button>
  );

  return (
    <AppPage
      title="Clustering Status"
      description="This server's connection to its cluster controller."
      actions={refresh}
    >
      {error ? (
        <Alert variant="danger" title="Could not load controller connection status" isInline>
          {error}
        </Alert>
      ) : status === null ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading controller connection status" />
        </Bullseye>
      ) : (
        <KeyValueTable data={status} ariaLabel="Controller connection status" />
      )}
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
