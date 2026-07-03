import * as React from 'react';
import { Alert, Bullseye, Button, Spinner } from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { KeyValueTable } from '@app/components/KeyValueTable';

const ServerStatus: React.FunctionComponent = () => {
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setStatus(null);
    setError(null);
    api
      .GetServerStatus()
      .then((response) => setStatus(response as unknown as Record<string, unknown>))
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const isLoading = status === null && error === null;

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
      ) : status === null ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading server status" />
        </Bullseye>
      ) : (
        <KeyValueTable data={status} ariaLabel="Server status" />
      )}
    </AppPage>
  );
};

export { ServerStatus };
