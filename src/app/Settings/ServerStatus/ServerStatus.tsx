import * as React from 'react';
import { Alert, Bullseye, Flex, FlexItem, Spinner } from '@patternfly/react-core';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { useAutoRefresh } from '@app/utils/useAutoRefresh';

const ServerStatus: React.FunctionComponent = () => {
  const fetchStatus = React.useCallback(
    () => api.GetServerStatus().then((response) => response as unknown as Record<string, unknown>),
    [],
  );
  const { data: status, error, refreshing, lastUpdated } = useAutoRefresh(fetchStatus);

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
