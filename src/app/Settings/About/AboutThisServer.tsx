import * as React from 'react';
import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardTitle,
  Spinner,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { mode_to_string } from '@app/utils/string_utils';

// A capability whose description starts with this word is a numeric limit
// (e.g. "Maximum number of Virtual Hubs") rather than a yes/no flag.
const MAXIMUM = 'Maximum';

// Render a caps value: numeric limits keep their number, flags become Yes/No.
const capsValue = (cap: VPN.VpnCaps): string => {
  if (cap.CapsDescrption_utf.startsWith(MAXIMUM)) {
    return cap.CapsValue_u32.toLocaleString();
  }
  if (cap.CapsValue_u32 === 1) {
    return 'Yes';
  }
  if (cap.CapsValue_u32 === 0) {
    return 'No';
  }
  return cap.CapsValue_u32.toLocaleString();
};

// Flags first, numeric limits last, matching the original console ordering.
const orderCaps = (list: VPN.VpnCaps[]): VPN.VpnCaps[] => {
  const flags = list.filter((cap) => !cap.CapsDescrption_utf.startsWith(MAXIMUM));
  const limits = list.filter((cap) => cap.CapsDescrption_utf.startsWith(MAXIMUM));
  return flags.concat(limits);
};

const About: React.FunctionComponent = () => {
  const [info, setInfo] = React.useState<Record<string, unknown> | null>(null);
  const [caps, setCaps] = React.useState<VPN.VpnCaps[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setInfo(null);
    setCaps(null);
    setError(null);
    Promise.all([api.GetServerInfo(), api.GetCaps()])
      .then(([serverInfo, capsList]) => {
        setInfo(serverInfo as unknown as Record<string, unknown>);
        setCaps(capsList.CapsList);
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const isLoading = info === null && error === null;

  // Show the server mode as text instead of the raw ServerType_u32 enum.
  const infoRows = info && { ...info, ServerType_u32: mode_to_string(info.ServerType_u32 as number) };

  return (
    <AppPage title="About This VPN Server" description="Product identity and the feature set this server supports.">
      {error ? (
          <Alert variant="danger" title="Could not load server information" isInline>
            {error}
          </Alert>
      ) : isLoading || infoRows === null || caps === null ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading server information" />
        </Bullseye>
      ) : (
        <Stack hasGutter>
          <StackItem>
            <Card>
              <CardTitle>Server information</CardTitle>
              <CardBody>
                <KeyValueTable data={infoRows} ariaLabel="Server information" />
              </CardBody>
            </Card>
          </StackItem>
          <StackItem>
            <Card>
              <CardTitle>Server capabilities</CardTitle>
              <CardBody>
                <Table aria-label="Server capabilities" variant="compact">
                  <Thead>
                    <Tr>
                      <Th width={40}>Capability</Th>
                      <Th>Value</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {orderCaps(caps).map((cap) => (
                      <Tr key={cap.CapsName_str}>
                        <Td dataLabel="Capability">{cap.CapsDescrption_utf}</Td>
                        <Td dataLabel="Value">{capsValue(cap)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </StackItem>
        </Stack>
      )}
    </AppPage>
  );
};

export { About };
