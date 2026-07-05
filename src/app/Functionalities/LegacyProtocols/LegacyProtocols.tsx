import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Spinner,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { useNavigate } from 'react-router-dom';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { binToBytes, downloadBlob } from '@app/utils/blob_utils';

type Config = Record<string, unknown>;

const LegacyProtocols: React.FunctionComponent = () => {
  const navigate = useNavigate();

  const [ipsec, setIpsec] = React.useState<Config | null>(null);
  const [ovpn, setOvpn] = React.useState<Config | null>(null);
  const [hubs, setHubs] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setIpsec(null);
    setOvpn(null);
    setError(null);
    Promise.all([api.GetIPsecServices(), api.GetOpenVpnSstpConfig(), api.EnumHub()])
      .then(([ipsecResp, ovpnResp, hubList]) => {
        setIpsec(ipsecResp as unknown as Config);
        setOvpn(ovpnResp as unknown as Config);
        setHubs((hubList.HubList ?? []).map((h) => h.HubName_str));
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const setIpsecField = (key: string, value: unknown) => setIpsec((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setOvpnField = (key: string, value: unknown) => setOvpn((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = () => {
    if (!ipsec || !ovpn) {
      return;
    }
    setSaving(true);
    setError(null);
    api
      .SetIPsecServices(new VPN.VpnIPsecServices(ipsec as Partial<VPN.VpnIPsecServices>))
      .then(() => api.SetOpenVpnSstpConfig(new VPN.VpnOpenVpnSstpConfig(ovpn as Partial<VPN.VpnOpenVpnSstpConfig>)))
      .then(() => {
        setSaving(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const downloadConfig = () => {
    api
      .MakeOpenVpnConfigFile()
      .then((response) => {
        const bytes = binToBytes(response.Buffer_bin);
        if (bytes) {
          downloadBlob(new Blob([bytes], { type: 'application/zip' }), 'OpenVPN_Sample_Config.zip');
        }
      })
      .catch((e) => setError(String(e)));
  };

  const isLoading = (ipsec === null || ovpn === null) && error === null;

  const actions = (
    <>
      <Button
        variant="secondary"
        icon={<SyncAltIcon />}
        onClick={load}
        isDisabled={isLoading || saving}
        style={{ marginInlineEnd: 'var(--pf-t--global--spacer--sm)' }}
      >
        Refresh
      </Button>
      <Button variant="primary" onClick={save} isDisabled={isLoading || saving} isLoading={saving}>
        Save
      </Button>
    </>
  );

  return (
    <AppPage
      title="Legacy Protocols"
      description="Enable L2TP/IPsec, EtherIP/L2TPv3, OpenVPN and SSTP so older clients and routers can connect."
      actions={actions}
    >
      {error && (
        <Alert variant="danger" title="Could not load or save legacy protocol settings" isInline>
          {error}
        </Alert>
      )}

      {isLoading || ipsec === null || ovpn === null ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading legacy protocol settings" />
        </Bullseye>
      ) : (
        <Stack hasGutter>
          <StackItem>
            <Card>
              <CardTitle>L2TP / IPsec VPN server</CardTitle>
              <CardBody>
                <Form>
                  <Switch
                    id="l2tp-ipsec"
                    label="Enable L2TP over IPsec"
                    isChecked={ipsec.L2TP_IPsec_bool === true}
                    onChange={(_event, checked) => setIpsecField('L2TP_IPsec_bool', checked)}
                  />
                  <Switch
                    id="l2tp-raw"
                    label="Enable L2TP without IPsec (raw, no encryption)"
                    isChecked={ipsec.L2TP_Raw_bool === true}
                    onChange={(_event, checked) => setIpsecField('L2TP_Raw_bool', checked)}
                  />
                  <Switch
                    id="etherip-ipsec"
                    label="Enable EtherIP / L2TPv3 over IPsec"
                    isChecked={ipsec.EtherIP_IPsec_bool === true}
                    onChange={(_event, checked) => setIpsecField('EtherIP_IPsec_bool', checked)}
                  />
                  <FormGroup label="IPsec pre-shared key" fieldId="ipsec-secret">
                    <TextInput
                      id="ipsec-secret"
                      value={String(ipsec.IPsec_Secret_str ?? '')}
                      onChange={(_event, value) => setIpsecField('IPsec_Secret_str', value)}
                      aria-label="IPsec pre-shared key"
                    />
                    <HelperText>
                      <HelperTextItem>
                        Keep it to 9 characters or fewer for compatibility with some L2TP clients.
                      </HelperTextItem>
                    </HelperText>
                  </FormGroup>
                  <FormGroup label="Default Virtual Hub for L2TP" fieldId="l2tp-hub">
                    <FormSelect
                      id="l2tp-hub"
                      value={String(ipsec.L2TP_DefaultHub_str ?? '')}
                      onChange={(_event, value) => setIpsecField('L2TP_DefaultHub_str', value)}
                      aria-label="Default Virtual Hub for L2TP"
                    >
                      {hubs.map((h) => (
                        <FormSelectOption key={h} value={h} label={h} />
                      ))}
                    </FormSelect>
                  </FormGroup>
                </Form>
              </CardBody>
            </Card>
          </StackItem>

          <StackItem>
            <Card>
              <CardTitle>EtherIP / L2TPv3 server (site-to-site)</CardTitle>
              <CardBody>
                <Content component="p" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>
                  Routers that support EtherIP / L2TPv3 over IPsec can bridge a remote site into a Virtual Hub. Each
                  client router is identified by its IPsec Phase 1 ID.
                </Content>
                <Button variant="secondary" onClick={() => navigate('/functionalities/legacyprotocols/etherip')}>
                  EtherIP / L2TPv3 detailed settings
                </Button>
              </CardBody>
            </Card>
          </StackItem>

          <StackItem>
            <Card>
              <CardTitle>OpenVPN and SSTP</CardTitle>
              <CardBody>
                <Form>
                  <Switch
                    id="openvpn"
                    label="Enable OpenVPN clone server function"
                    isChecked={ovpn.EnableOpenVPN_bool === true}
                    onChange={(_event, checked) => setOvpnField('EnableOpenVPN_bool', checked)}
                  />
                  <FormGroup label="OpenVPN UDP ports" fieldId="openvpn-ports">
                    <TextInput
                      id="openvpn-ports"
                      value={String(ovpn.OpenVPNPortList_str ?? '')}
                      onChange={(_event, value) => setOvpnField('OpenVPNPortList_str', value)}
                      aria-label="OpenVPN UDP ports"
                    />
                    <HelperText>
                      <HelperTextItem>Comma-separated UDP port numbers (for example 1194).</HelperTextItem>
                    </HelperText>
                  </FormGroup>
                  <Switch
                    id="sstp"
                    label="Enable Microsoft SSTP VPN clone server function"
                    isChecked={ovpn.EnableSSTP_bool === true}
                    onChange={(_event, checked) => setOvpnField('EnableSSTP_bool', checked)}
                  />
                  <FormGroup label="OpenVPN sample configuration" fieldId="openvpn-config">
                    <Button variant="secondary" onClick={downloadConfig}>
                      Download OpenVPN sample config
                    </Button>
                  </FormGroup>
                </Form>
              </CardBody>
            </Card>
          </StackItem>
        </Stack>
      )}
    </AppPage>
  );
};

export { LegacyProtocols };
