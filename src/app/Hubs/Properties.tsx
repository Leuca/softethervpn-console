import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
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

const Properties: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  // Working copy of the full GetHub response, plus an optional new admin password.
  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');

  const load = React.useCallback(() => {
    setConfig(null);
    setError(null);
    setNewPassword('');
    api
      .GetHub(new VPN.VpnRpcCreateHub({ HubName_str: hub }))
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
    // Keep the current password unless a new one is entered (GetHub never
    // returns it; the constructor would otherwise send an empty one).
    const obj = new VPN.VpnRpcCreateHub(config as Partial<VPN.VpnRpcCreateHub>);
    if (newPassword) {
      obj.AdminPasswordPlainText_str = newPassword;
    } else {
      delete (obj as { AdminPasswordPlainText_str?: string }).AdminPasswordPlainText_str;
    }
    api
      .SetHub(obj)
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
        <Alert variant="danger" title="Could not load or save hub properties" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading hub properties" />
        </Bullseye>
      ) : config !== null ? (
        <Form style={{ maxWidth: '32rem' }}>
          <FormGroup label="Max sessions" fieldId="hub-maxsession">
            <TextInput
              type="number"
              id="hub-maxsession"
              min={0}
              value={String(config.MaxSession_u32 ?? 0)}
              onChange={(_event, value) => setField('MaxSession_u32', Number(value) || 0)}
              aria-label="Max sessions"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>0 means unlimited.</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup fieldId="hub-noenum">
            <Checkbox
              id="hub-noenum"
              label="Hide this hub from anonymous enumeration"
              isChecked={Boolean(config.NoEnum_bool)}
              onChange={(_event, checked) => setField('NoEnum_bool', checked)}
            />
          </FormGroup>
          <FormGroup label="New admin password" fieldId="hub-password">
            <TextInput
              type="password"
              id="hub-password"
              value={newPassword}
              onChange={(_event, value) => setNewPassword(value)}
              placeholder="Leave blank to keep the current password"
              aria-label="New admin password"
            />
          </FormGroup>
        </Form>
      ) : null}
    </Flex>
  );
};

export { Properties };
