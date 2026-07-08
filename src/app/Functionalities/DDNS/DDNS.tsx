import * as React from 'react';
import {
  ActionGroup,
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  FormGroup,
  FormHelperText,
  Gallery,
  HelperText,
  HelperTextItem,
  InputGroup,
  InputGroupItem,
  InputGroupText,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  NumberInput,
  Radio,
  Spinner,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { useServer } from '@app/ServerContext';
import { AppPage } from '@app/components/AppPage';
import { binToBytes } from '@app/utils/blob_utils';
import { parseCertificate } from '@app/utils/x509';

const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_HOSTNAME = 3;

// Hostnames accept letters, numbers and dashes only.
const isValidHostname = (value: string): boolean => value.length >= MIN_HOSTNAME && /^[A-Za-z0-9-]+$/.test(value);

// The DDNS error strings carry a trailing detail after the first dot; the UI
// shows only the leading summary.
const errorSummary = (value: string): string => value.split('.')[0];

// Some builds advertise the DDNS proxy capability but reject the proxy RPCs
// with error code 33 (Unsupported); handled as an informational note.
const isUnsupportedError = (error: string): boolean => /code[=\s]*33\b/i.test(error) || /unsupported/i.test(error);

// This server's connection to the SoftEther DDNS service, plus a change form.
const DdnsSection: React.FunctionComponent = () => {
  const [status, setStatus] = React.useState<VPN.VpnDDnsClientStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hostname, setHostname] = React.useState('');
  const [changing, setChanging] = React.useState(false);
  const [changeError, setChangeError] = React.useState<string | null>(null);
  // FQDN to offer regenerating the server cert for (null = no prompt).
  const [certPrompt, setCertPrompt] = React.useState<string | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const [certDone, setCertDone] = React.useState(false);

  const load = React.useCallback(() => {
    setStatus(null);
    setError(null);
    api
      .GetDDnsClientStatus()
      .then((response) => {
        setStatus(response);
        setHostname(response.CurrentHostName_str);
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // After a hostname change, SSTP / VPN Azure clients need the server cert CN to
  // match the new FQDN. If the cert is self-signed and its CN no longer matches,
  // offer to regenerate it (mirrors the native Server Manager).
  const maybePromptCertRegen = (fqdn: string) => {
    if (!fqdn) {
      return;
    }
    api
      .GetServerCert()
      .then((response) => {
        const bytes = binToBytes(response.Cert_bin);
        if (!bytes) {
          return;
        }
        try {
          const cert = parseCertificate(bytes);
          if (cert.isSelfIssued && cert.subject.commonName !== fqdn) {
            setCertPrompt(fqdn);
          }
        } catch {
          // Ignore an unparseable certificate; just skip the prompt.
        }
      })
      .catch(() => undefined);
  };

  const changeHostname = () => {
    setChanging(true);
    setChangeError(null);
    setCertDone(false);
    api
      .ChangeDDnsClientHostname(new VPN.VpnRpcTest({ StrValue_str: hostname }))
      .then(() => api.GetDDnsClientStatus())
      .then((response) => {
        setStatus(response);
        setHostname(response.CurrentHostName_str);
        setChanging(false);
        maybePromptCertRegen(response.CurrentFqdn_str);
      })
      .catch((e) => {
        setChangeError(String(e));
        setChanging(false);
      });
  };

  const regenerateCert = () => {
    const fqdn = certPrompt;
    if (!fqdn) {
      return;
    }
    setRegenerating(true);
    api
      .RegenerateServerCert(new VPN.VpnRpcTest({ StrValue_str: fqdn }))
      .then(() => {
        setRegenerating(false);
        setCertPrompt(null);
        setCertDone(true);
      })
      .catch((e) => {
        setRegenerating(false);
        setCertPrompt(null);
        setChangeError(String(e));
      });
  };

  const isLoading = status === null && error === null;
  const suffix = status?.DnsSuffix_str || '.softether.net';
  const unchanged = status !== null && hostname === status.CurrentHostName_str;
  const validationState = hostname === '' || isValidHostname(hostname) ? 'default' : 'error';

  const ipv4 = status && (status.Err_IPv4_u32 === 0 ? status.CurrentIPv4_str || '(none)' : errorSummary(status.ErrStr_IPv4_utf));
  const ipv6 = status && (status.Err_IPv6_u32 === 0 ? status.CurrentIPv6_str || '(none)' : errorSummary(status.ErrStr_IPv6_utf));

  if (error) {
    return (
      <Alert variant="danger" title="Could not load Dynamic DNS status" isInline>
        {error}
      </Alert>
    );
  }

  if (isLoading || status === null) {
    return (
      <Bullseye>
        <Spinner size="xl" aria-label="Loading Dynamic DNS status" />
      </Bullseye>
    );
  }

  return (
    <Gallery hasGutter minWidths={{ default: '320px' }}>
      <Card isFullHeight>
        <CardTitle>Assigned hostname</CardTitle>
        <CardBody>
          <DescriptionList>
            <DescriptionListGroup>
              <DescriptionListTerm>
                Hostname{' '}
                <Tooltip
                  content={
                    <div>
                      Access this server by its DNS hostname {status.CurrentFqdn_str}. To force an address family, use{' '}
                      {status.CurrentHostName_str}.v4.softether.net or {status.CurrentHostName_str}.v6.softether.net.
                    </div>
                  }
                >
                  <span aria-label="Hostname details" tabIndex={0}>
                    <OutlinedQuestionCircleIcon />
                  </span>
                </Tooltip>
              </DescriptionListTerm>
              <DescriptionListDescription>{status.CurrentFqdn_str || '-'}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Global IPv4 address</DescriptionListTerm>
              <DescriptionListDescription>{ipv4}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Global IPv6 address</DescriptionListTerm>
              <DescriptionListDescription>{ipv6}</DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </CardBody>
      </Card>

      <Card isFullHeight>
        <CardTitle>Change hostname</CardTitle>
        <CardBody>
          {changeError && (
            <Alert
              variant="danger"
              title="Could not change the hostname"
              isInline
              style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
            >
              {changeError}
            </Alert>
          )}
          {certDone && (
            <Alert
              variant="success"
              title="The server certificate was regenerated to match the new hostname."
              isInline
              style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
            />
          )}
          <Form>
            <FormGroup label="New hostname" fieldId="ddns-hostname">
              <InputGroup>
                <InputGroupItem isFill>
                  <TextInput
                    id="ddns-hostname"
                    value={hostname}
                    onChange={(_event, value) => setHostname(value)}
                    validated={validationState}
                    aria-label="New hostname"
                    isDisabled={changing}
                  />
                </InputGroupItem>
                <InputGroupText>{suffix}</InputGroupText>
              </InputGroup>
              {validationState === 'error' && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">
                      At least {MIN_HOSTNAME} characters: letters, numbers and dashes only.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            <ActionGroup>
              <Button
                variant="primary"
                onClick={changeHostname}
                isDisabled={unchanged || validationState === 'error' || changing}
                isLoading={changing}
              >
                Set hostname
              </Button>
              <Button
                variant="link"
                onClick={() => setHostname(status.CurrentHostName_str)}
                isDisabled={unchanged || changing}
              >
                Restore
              </Button>
            </ActionGroup>
          </Form>
        </CardBody>
      </Card>

      <Modal variant={ModalVariant.small} isOpen={certPrompt !== null} onClose={() => setCertPrompt(null)}>
        <ModalHeader title="Update the server certificate?" />
        <ModalBody>
          <Content component="p">
            The Dynamic DNS hostname is now <strong>{certPrompt}</strong>. Microsoft SSTP and VPN Azure clients require
            the server certificate&apos;s common name (CN) to exactly match the hostname they connect to.
          </Content>
          <Content component="p">
            Regenerate the self-signed server certificate with CN = <strong>{certPrompt}</strong>? Keep the current one
            if you use your own CA-issued certificate.
          </Content>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={regenerateCert} isLoading={regenerating} isDisabled={regenerating}>
            Regenerate certificate
          </Button>
          <Button variant="link" onClick={() => setCertPrompt(null)} isDisabled={regenerating}>
            Keep current
          </Button>
        </ModalFooter>
      </Modal>
    </Gallery>
  );
};

// Optional proxy the DDNS client uses to reach the service (capability-gated).
const ProxySection: React.FunctionComponent = () => {
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unsupported, setUnsupported] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [proxyType, setProxyType] = React.useState<number>(VPN.VpnRpcProxyType.Direct);
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState(8080);
  const [user, setUser] = React.useState('');
  const [password, setPassword] = React.useState('');

  const load = React.useCallback(() => {
    setLoaded(false);
    setError(null);
    setUnsupported(false);
    api
      .GetDDnsInternetSettng()
      .then((response) => {
        setProxyType(response.ProxyType_u32);
        setHost(response.ProxyHostName_str);
        setPort(response.ProxyPort_u32 || 8080);
        setUser(response.ProxyUsername_str);
        setPassword(response.ProxyPassword_str);
        setLoaded(true);
      })
      .catch((e) => {
        if (isUnsupportedError(String(e))) {
          setUnsupported(true);
        } else {
          setError(String(e));
        }
      });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const clampPort = (value: number) => Math.min(Math.max(value, MIN_PORT), MAX_PORT);

  const save = () => {
    setSaving(true);
    setError(null);
    api
      .SetDDnsInternetSettng(
        new VPN.VpnInternetSetting({
          ProxyType_u32: proxyType,
          ProxyHostName_str: host,
          ProxyPort_u32: port,
          ProxyUsername_str: user,
          ProxyPassword_str: password,
        }),
      )
      .then(() => {
        setSaving(false);
        load();
      })
      .catch((e) => {
        setSaving(false);
        if (isUnsupportedError(String(e))) {
          setUnsupported(true);
        } else {
          setError(String(e));
        }
      });
  };

  const isDirect = proxyType === VPN.VpnRpcProxyType.Direct;

  return (
    <Card>
      <CardTitle>Proxy for the DDNS client</CardTitle>
      <CardBody>
        {error && (
          <Alert
            variant="danger"
            title="Proxy settings error"
            isInline
            style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
          >
            {error}
          </Alert>
        )}
        {unsupported ? (
          <Alert variant="info" title="Proxy configuration is not supported by this server" isInline>
            This server reports the Dynamic DNS client cannot be configured to use a proxy.
          </Alert>
        ) : !loaded ? (
          <Bullseye>
            <Spinner size="lg" aria-label="Loading proxy settings" />
          </Bullseye>
        ) : (
          <Form>
            <FormGroup label="Connection" role="radiogroup" fieldId="ddns-proxy-type">
              <Radio
                id="ddns-proxy-direct"
                name="ddns-proxy-type"
                label="Direct TCP/IP connection (no proxy)"
                isChecked={proxyType === VPN.VpnRpcProxyType.Direct}
                onChange={() => setProxyType(VPN.VpnRpcProxyType.Direct)}
              />
              <Radio
                id="ddns-proxy-http"
                name="ddns-proxy-type"
                label="Connect via HTTP proxy server"
                isChecked={proxyType === VPN.VpnRpcProxyType.HTTP}
                onChange={() => setProxyType(VPN.VpnRpcProxyType.HTTP)}
              />
              <Radio
                id="ddns-proxy-socks"
                name="ddns-proxy-type"
                label="Connect via SOCKS proxy server"
                isChecked={proxyType === VPN.VpnRpcProxyType.SOCKS}
                onChange={() => setProxyType(VPN.VpnRpcProxyType.SOCKS)}
              />
            </FormGroup>
            <FormGroup label="Host name" fieldId="ddns-proxy-host">
              <TextInput
                id="ddns-proxy-host"
                value={host}
                onChange={(_event, value) => setHost(value)}
                aria-label="Proxy host name"
                isDisabled={isDirect}
              />
            </FormGroup>
            <FormGroup label="Port" fieldId="ddns-proxy-port">
              <NumberInput
                id="ddns-proxy-port"
                value={port}
                min={MIN_PORT}
                max={MAX_PORT}
                onMinus={() => setPort((p) => clampPort(p - 1))}
                onPlus={() => setPort((p) => clampPort(p + 1))}
                onChange={(event) => {
                  const value = Number((event.target as HTMLInputElement).value);
                  setPort(Number.isNaN(value) ? MIN_PORT : clampPort(value));
                }}
                inputName="ddns-proxy-port"
                inputAriaLabel="Proxy port"
                minusBtnAriaLabel="Decrease port"
                plusBtnAriaLabel="Increase port"
                isDisabled={isDirect}
              />
            </FormGroup>
            <FormGroup label="User name" fieldId="ddns-proxy-user">
              <TextInput
                id="ddns-proxy-user"
                value={user}
                onChange={(_event, value) => setUser(value)}
                aria-label="Proxy user name"
                isDisabled={isDirect}
              />
            </FormGroup>
            <FormGroup label="Password" fieldId="ddns-proxy-pass">
              <TextInput
                id="ddns-proxy-pass"
                type="password"
                value={password}
                onChange={(_event, value) => setPassword(value)}
                aria-label="Proxy password"
                isDisabled={isDirect}
              />
            </FormGroup>
            <ActionGroup>
              <Button variant="primary" onClick={save} isDisabled={saving || (!isDirect && host === '')} isLoading={saving}>
                Save
              </Button>
            </ActionGroup>
          </Form>
        )}
      </CardBody>
    </Card>
  );
};

const DynDNS: React.FunctionComponent = () => {
  const { ddnsProxy } = useServer();

  return (
    <AppPage
      title="Dynamic DNS"
      description="A free, permanent DNS hostname for this server, updated automatically when its global IP address changes."
    >
      <Content component="p" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--lg)' }}>
        The Dynamic DNS service assigns this server a unique hostname you can use in VPN Client and VPN Bridge settings,
        even behind a NAT or with a dynamic IP address.
      </Content>
      <DdnsSection />
      {ddnsProxy && (
        <div style={{ marginBlockStart: 'var(--pf-t--global--spacer--lg)' }}>
          <ProxySection />
        </div>
      )}
    </AppPage>
  );
};

export { DynDNS };
