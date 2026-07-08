import * as React from 'react';
import { Alert, Bullseye, Flex, FlexItem, Spinner } from '@patternfly/react-core';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { KeyValueTable } from '@app/components/KeyValueTable';

const ServerStatus: React.FunctionComponent = () => {
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const load = React.useCallback(() => {
    setRefreshing(true);
    setError(null);
    api
      .GetServerStatus()
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
    <AppPage title="Server Status" description="Live runtime statistics reported by the VPN server.">
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
          <Alert variant="danger" title="Could not load server status" isInline>
            {error}
          </Alert>
        )}
        {isInitialLoading ? (
          <Bullseye>
            <Spinner size="xl" aria-label="Loading server status" />
          </Bullseye>
        ) : status !== null ? (
          <KeyValueTable data={status} ariaLabel="Server status" />
        ) : null}
      </Flex>
    </AppPage>
  );
};

export { ServerStatus };
