import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  Spinner,
  Stack,
  StackItem,
  Switch,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import { useNavigate } from 'react-router-dom';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';

const VPN_AZURE_URL = 'https://www.vpnazure.net/en/';
const CONNECTING_REFRESH_MS = 1000;

const VpnAzure: React.FunctionComponent = () => {
  const navigate = useNavigate();

  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [connected, setConnected] = React.useState<boolean | null>(false);
  const [hostname, setHostname] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refreshStatus = React.useCallback(() =>
    api
      .GetAzureStatus()
      .then((status) => {
        setConnected(status.IsConnected_bool);
        setEnabled(status.IsEnabled_bool);
        if (status.IsEnabled_bool) {
          return api.GetDDnsClientStatus().then((ddns) => {
            setHostname(ddns.CurrentHostName_str);
            return status;
          });
        }
        setHostname('');
        return status;
      }), []);

  const load = React.useCallback(() => {
    setError(null);
    refreshStatus().catch((e) => setError(String(e)));
  }, [refreshStatus]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (connected !== null) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      refreshStatus().catch((e) => setError(String(e)));
    }, CONNECTING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [connected, refreshStatus]);

  const toggle = (_event: React.FormEvent<HTMLInputElement>, isChecked: boolean) => {
    setBusy(true);
    setError(null);
    api
      .SetAzureStatus(new VPN.VpnRpcAzureStatus({ IsEnabled_bool: isChecked }))
      .then((status) => {
        const nextEnabled = typeof status.IsEnabled_bool === 'boolean' ? status.IsEnabled_bool : isChecked;
        setEnabled(nextEnabled);
        if (nextEnabled) {
          setConnected(null);
          return api.GetDDnsClientStatus().then((ddns) => {
            setHostname(ddns.CurrentHostName_str);
            setBusy(false);
          });
        } else {
          setConnected(false);
          setHostname('');
          setBusy(false);
          return undefined;
        }
      })
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
  };

  const isLoading = enabled === null && error === null;

  return (
    <AppPage
      title="VPN Azure"
      description="A free cloud relay by the SoftEther VPN Project that lets clients reach this server without a global IP address."
    >
      <Stack hasGutter>
        {error && (
          <StackItem>
            <Alert variant="danger" title="VPN Azure operation failed" isInline>
              {error}
            </Alert>
          </StackItem>
        )}

        <StackItem>
          <Content component="p">
            VPN Azure works behind firewalls and NATs and requires no configuration. Home clients can connect using the
            built-in SSTP VPN client of Windows.{' '}
            <Button
              variant="link"
              isInline
              icon={<ExternalLinkAltIcon />}
              iconPosition="end"
              component="a"
              href={VPN_AZURE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              How to use VPN Azure
            </Button>
          </Content>
        </StackItem>

        <StackItem isFilled>
          {isLoading ? (
            <Bullseye>
              <Spinner size="xl" aria-label="Loading VPN Azure status" />
            </Bullseye>
          ) : enabled !== null ? (
            <Card>
              <CardBody>
                <Stack hasGutter>
                  <StackItem>
                    <Switch
                      id="azure-switch"
                      label="VPN Azure enabled"
                      isChecked={enabled}
                      onChange={toggle}
                      isDisabled={busy}
                    />
                  </StackItem>
                  <StackItem>
                    <DescriptionList isHorizontal>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Status</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Label color={connected === null ? 'blue' : connected ? 'green' : 'grey'} isCompact>
                            {connected === null ? 'Connecting' : connected ? 'Connected' : 'Not connected'}
                          </Label>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      {enabled && (
                        <DescriptionListGroup>
                          <DescriptionListTerm>VPN Azure hostname</DescriptionListTerm>
                          <DescriptionListDescription>
                            {hostname ? `${hostname}.vpnazure.net` : '-'}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      )}
                    </DescriptionList>
                  </StackItem>
                  {enabled && (
                    <>
                      <StackItem>
                        <Content component="small">
                          The VPN Azure hostname mirrors the Dynamic DNS hostname with the domain suffix changed to
                          vpnazure.net.
                        </Content>
                      </StackItem>
                      <StackItem>
                        <Button variant="secondary" onClick={() => navigate('/functionalities/ddns')}>
                          Change hostname
                        </Button>
                      </StackItem>
                    </>
                  )}
                </Stack>
              </CardBody>
            </Card>
          ) : null}
        </StackItem>
      </Stack>
    </AppPage>
  );
};

export { VpnAzure };
