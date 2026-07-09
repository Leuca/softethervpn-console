import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Content,
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
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { HubAdminOptions } from '@app/Hubs/HubAdminOptions';
import { HubExtendedOptions } from '@app/Hubs/HubExtendedOptions';
import { HubMessage } from '@app/Hubs/HubMessage';
import { HubSourceAccessControl } from '@app/Hubs/HubSourceAccessControl';

const settingsTrigger = (title: string, description: string) => {
  const SettingsTrigger = (open: () => void) => (
    <Card isClickable isFullHeight>
      <CardHeader
        selectableActions={{
          selectableActionAriaLabel: title,
          onClickAction: open,
        }}
      >
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody
        style={{
          color: 'var(--pf-t--global--text--color--subtle)',
          fontSize: 'var(--pf-t--global--font--size--sm)',
          overflowWrap: 'anywhere',
        }}
      >
        {description}
      </CardBody>
    </Card>
  );

  return SettingsTrigger;
};

const Properties: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  // Working copy of the full GetHub response, plus an optional new admin password.
  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');

  const load = React.useCallback(() => {
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
    obj.HubName_str = hub; // ensure the save targets this hub even if GetHub omits it
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
        <>
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
          <section>
            <Content component="h2">Related hub settings</Content>
            <Content component="p">
              Open focused tools for settings that are related to this hub but managed in their own dialogs.
            </Content>
            <div
              style={{
                display: 'grid',
                gap: 'var(--pf-t--global--spacer--md)',
                gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
                marginBlockStart: 'var(--pf-t--global--spacer--md)',
              }}
            >
              <HubMessage
                hub={hub}
                trigger={settingsTrigger('Set the Message', 'Show a short notice to clients when they connect.')}
              />
              <HubAdminOptions
                hub={hub}
                trigger={settingsTrigger('Administration Options', 'Configure limits and permissions for hub administrators.')}
              />
              <HubExtendedOptions
                hub={hub}
                trigger={settingsTrigger('Extended Options', 'Tune low-level hub behavior and compatibility switches.')}
              />
              <HubSourceAccessControl
                hub={hub}
                trigger={settingsTrigger('Source IP Access Control', 'Restrict access to this hub by source address.')}
              />
            </div>
          </section>
        </>
      ) : null}
    </Flex>
  );
};

export { Properties };
