import * as React from 'react';
import { Alert, Bullseye, Button, Spinner } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { SyncAltIcon } from '@patternfly/react-icons';
import { api } from '@app/utils/vpnrpc_settings';
import { split_string_by_capitalization } from '@app/utils/string_utils';
import { AppPage } from '@app/components/AppPage';

interface StatusRow {
  key: string;
  label: string;
  value: string;
}

// Render a raw GetServerStatus field for display: dates (..._dt) as a locale
// string, numbers with thousands separators (the byte/packet counters are
// huge), everything else as-is.
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (key.endsWith('_dt') && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

const ServerStatus: React.FunctionComponent = () => {
  const [rows, setRows] = React.useState<StatusRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setRows(null);
    setError(null);
    api
      .GetServerStatus()
      .then((response) => {
        const raw = response as unknown as Record<string, unknown>;
        setRows(
          Object.keys(raw).map((key) => ({
            key,
            label: split_string_by_capitalization(key),
            value: formatValue(key, raw[key]),
          })),
        );
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const isLoading = rows === null && error === null;

  const refresh = (
    <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading}>
      Refresh
    </Button>
  );

  return (
    <AppPage title="Server Status" description="Live runtime statistics reported by the VPN server." actions={refresh}>
      {error ? (
        <Alert variant="danger" title="Could not load server status" isInline>
          {error}
        </Alert>
      ) : rows === null ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading server status" />
        </Bullseye>
      ) : (
        <Table aria-label="Server status" variant="compact">
          <Thead>
            <Tr>
              <Th width={40}>Item</Th>
              <Th>Value</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => (
              <Tr key={row.key}>
                <Td dataLabel="Item">{row.label}</Td>
                <Td dataLabel="Value">{row.value}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </AppPage>
  );
};

export { ServerStatus };
