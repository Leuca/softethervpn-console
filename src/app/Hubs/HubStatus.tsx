import * as React from 'react';
import { Alert, Bullseye, Flex, FlexItem, Spinner } from '@patternfly/react-core';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { hubTypeLabel } from '@app/utils/format';

// Replace the coded status fields with readable values before the generic
// KeyValueTable renders them (it would otherwise show a bare enum number for
// the hub type and Yes/No for the flags).
function prettifyStatus(status: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...status };
  if ('Online_bool' in out) {
    out.Online_bool = out.Online_bool ? 'Online' : 'Offline';
  }
  if ('HubType_u32' in out) {
    out.HubType_u32 = hubTypeLabel(Number(out.HubType_u32));
  }
  if ('SecureNATEnabled_bool' in out) {
    out.SecureNATEnabled_bool = out.SecureNATEnabled_bool ? 'Enabled' : 'Disabled';
  }
  return out;
}

const HubStatus: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const load = React.useCallback(() => {
    setRefreshing(true);
    setError(null);
    api
      .GetHubStatus(new VPN.VpnRpcHubStatus({ HubName_str: hub }))
      .then((response) => {
        setStatus(prettifyStatus(response as unknown as Record<string, unknown>));
        setLastUpdated(new Date());
      })
      .catch((e) => setError(String(e)))
      .finally(() => setRefreshing(false));
  }, [hub]);

  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const isInitialLoading = status === null && error === null;

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
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
        <Alert variant="danger" title="Could not load hub status" isInline>
          {error}
        </Alert>
      )}
      {isInitialLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading hub status" />
        </Bullseye>
      ) : status !== null ? (
        <KeyValueTable data={status} ariaLabel={`Status for ${hub}`} />
      ) : null}
    </Flex>
  );
};

export { HubStatus };
