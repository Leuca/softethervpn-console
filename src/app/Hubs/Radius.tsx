import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';

const Radius: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  // Working copy of the full GetHubRadius response, plus an optional new secret.
  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState('');

  const load = React.useCallback(() => {
    setConfig(null);
    setError(null);
    setNewSecret('');
    api
      .GetHubRadius(new VPN.VpnRpcRadius({ HubName_str: hub }))
      .then((response) => setConfig(response as unknown as Record<string, unknown>))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  const setField = (key: string, value: unknown) => setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = () => {
    if (!config) {
      return;
    }
    setSaving(true);
    // Keep the current secret unless a new one is entered (GetHubRadius does not
    // return it; the constructor would otherwise send an empty one).
    const obj = new VPN.VpnRpcRadius(config as Partial<VPN.VpnRpcRadius>);
    if (newSecret) {
      obj.RadiusSecret_str = newSecret;
    } else {
      delete (obj as { RadiusSecret_str?: string }).RadiusSecret_str;
    }
    api
      .SetHubRadius(obj)
      .then(() => {
        setSaving(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const isLoading = config === null && error === null;

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading || saving}>
            Refresh
          </Button>
        </FlexItem>
        <FlexItem>
          <Button variant="primary" onClick={save} isDisabled={config === null || saving} isLoading={saving}>
            Save
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="Could not load or save RADIUS settings" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading RADIUS settings" />
        </Bullseye>
      ) : config !== null ? (
        <Form style={{ maxWidth: '32rem' }}>
          <FormGroup label="RADIUS server" fieldId="radius-server">
            <TextInput
              id="radius-server"
              value={String(config.RadiusServerName_str ?? '')}
              onChange={(_event, value) => setField('RadiusServerName_str', value)}
              aria-label="RADIUS server"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>Leave empty to disable RADIUS authentication for this hub.</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup label="Port" fieldId="radius-port">
            <TextInput
              type="number"
              id="radius-port"
              min={1}
              max={65535}
              value={String(config.RadiusPort_u32 ?? 1812)}
              onChange={(_event, value) => setField('RadiusPort_u32', Number(value) || 0)}
              aria-label="Port"
            />
          </FormGroup>
          <FormGroup label="Shared secret" fieldId="radius-secret">
            <TextInput
              type="password"
              id="radius-secret"
              value={newSecret}
              onChange={(_event, value) => setNewSecret(value)}
              placeholder="Leave blank to keep the current secret"
              aria-label="Shared secret"
            />
          </FormGroup>
          <FormGroup label="Retry interval (ms)" fieldId="radius-retry">
            <TextInput
              type="number"
              id="radius-retry"
              min={0}
              value={String(config.RadiusRetryInterval_u32 ?? 0)}
              onChange={(_event, value) => setField('RadiusRetryInterval_u32', Number(value) || 0)}
              aria-label="Retry interval (ms)"
            />
          </FormGroup>
        </Form>
      ) : null}
    </Flex>
  );
};

export { Radius };
