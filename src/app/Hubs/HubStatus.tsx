import * as React from 'react';
import { Alert, Bullseye, Button, Flex, FlexItem, Spinner, Stack, StackItem } from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
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

  const load = React.useCallback(() => {
    setStatus(null);
    setError(null);
    api
      .GetHubStatus(new VPN.VpnRpcHubStatus({ HubName_str: hub }))
      .then((response) => setStatus(prettifyStatus(response as unknown as Record<string, unknown>)))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Stack hasGutter>
      <StackItem>
        <Flex
          justifyContent={{ default: 'justifyContentFlexEnd' }}
          style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
        >
          <FlexItem>
            <Button
              variant="secondary"
              icon={<SyncAltIcon />}
              onClick={load}
              isDisabled={status === null && error === null}
            >
              Refresh
            </Button>
          </FlexItem>
        </Flex>
      </StackItem>
      <StackItem>
        {error ? (
          <Alert variant="danger" title="Could not load hub status" isInline>
            {error}
          </Alert>
        ) : status === null ? (
          <Bullseye>
            <Spinner size="xl" aria-label="Loading hub status" />
          </Bullseye>
        ) : (
          <KeyValueTable data={status} ariaLabel={`Status for ${hub}`} />
        )}
      </StackItem>
    </Stack>
  );
};

export { HubStatus };
