import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  FileUpload,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { CertificateModal } from '@app/CertificateViewer/CertificateViewer';

// TLS cipher suites the server can be pinned to (OpenSSL names).
const CIPHERS = [
  'RC4-MD5', 'RC4-SHA', 'AES128-SHA', 'AES256-SHA', 'DES-CBC-SHA', 'DES-CBC3-SHA',
  'DHE-RSA-AES128-SHA', 'DHE-RSA-AES256-SHA', 'AES128-GCM-SHA256', 'AES128-SHA256',
  'AES256-GCM-SHA384', 'AES256-SHA256', 'DHE-RSA-AES128-GCM-SHA256', 'DHE-RSA-AES128-SHA256',
  'DHE-RSA-AES256-GCM-SHA384', 'DHE-RSA-AES256-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-SHA256', 'ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-SHA384',
  'DHE-RSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305',
];

const readFileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });

// --- Admin password ---------------------------------------------------------

const AdminPasswordCard: React.FunctionComponent = () => {
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [status, setStatus] = React.useState<{ variant: 'success' | 'danger'; text: string } | null>(null);
  const mismatch = confirm !== '' && confirm !== password;
  const canChange = password !== '' && confirm !== '' && confirm === password;

  const change = () => {
    api
      .SetServerPassword(new VPN.VpnRpcSetPassword({ PlainTextPassword_str: password }))
      .then(() => {
        setPassword('');
        setConfirm('');
        setStatus({ variant: 'success', text: 'The server administrator password has been changed.' });
      })
      .catch((e) => setStatus({ variant: 'danger', text: String(e) }));
  };

  return (
    <Card>
      <CardTitle>Server administrator password</CardTitle>
      <CardBody>
        {status && (
          <Alert variant={status.variant} title={status.text} isInline style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }} />
        )}
        <Form>
          <FormGroup label="New password" fieldId="admin-pw">
            <TextInput type="password" id="admin-pw" value={password} onChange={(_e, v) => setPassword(v)} aria-label="New password" />
          </FormGroup>
          <FormGroup label="Confirm password" fieldId="admin-pw2">
            <TextInput
              type="password"
              id="admin-pw2"
              value={confirm}
              onChange={(_e, v) => setConfirm(v)}
              validated={mismatch ? 'error' : 'default'}
              aria-label="Confirm password"
            />
            {mismatch && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">The passwords do not match.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
          <Button variant="primary" onClick={change} isDisabled={!canChange}>
            Change password
          </Button>
        </Form>
      </CardBody>
    </Card>
  );
};

// --- Server SSL certificate -------------------------------------------------

const ServerCertCard: React.FunctionComponent = () => {
  const [cert, setCert] = React.useState<Uint8Array | string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);

  const [regenOpen, setRegenOpen] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [cn, setCn] = React.useState('');

  const [certFile, setCertFile] = React.useState('');
  const [keyFile, setKeyFile] = React.useState('');
  const certBytes = React.useRef<Uint8Array | null>(null);
  const keyBytes = React.useRef<Uint8Array | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    api
      .GetServerCert()
      .then((r) => {
        setCert(r.Cert_bin ?? null);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const regenerate = () => {
    setRegenerating(true);
    setError(null);
    api
      .RegenerateServerCert(new VPN.VpnRpcTest({ StrValue_str: cn.trim() }))
      .then(() => {
        setRegenOpen(false);
        load();
      })
      .catch((e) => {
        setRegenOpen(false);
        setError(String(e));
      })
      .finally(() => setRegenerating(false));
  };

  const importCert = () => {
    if (!certBytes.current || !keyBytes.current) {
      return;
    }
    api
      .SetServerCert(new VPN.VpnRpcKeyPair({ Cert_bin: certBytes.current, Key_bin: keyBytes.current }))
      .then(() => {
        setCertFile('');
        setKeyFile('');
        certBytes.current = null;
        keyBytes.current = null;
        load();
      })
      .catch((e) => setError(String(e)));
  };

  return (
    <Card>
      <CardTitle>Server SSL certificate</CardTitle>
      <CardBody>
        {error && <Alert variant="danger" title="Certificate operation failed" isInline style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>{error}</Alert>}
        {!loaded ? (
          <Bullseye>
            <Spinner size="lg" aria-label="Loading server certificate" />
          </Bullseye>
        ) : (
          <Stack hasGutter>
            <StackItem>
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 'var(--pf-t--global--spacer--sm)' }}>
                <Button variant="secondary" onClick={() => setViewOpen(true)} isDisabled={cert === null}>
                  View current certificate
                </Button>
                <Button variant="secondary" onClick={() => { setCn(''); setRegenOpen(true); }}>
                  Regenerate self-signed certificate
                </Button>
              </span>
            </StackItem>
            <StackItem>
              <Content component="h3">Import a certificate and private key</Content>
              <Form>
                <FormGroup label="Certificate (PEM/DER)" fieldId="cert-file">
                  <FileUpload
                    id="cert-file"
                    type="dataURL"
                    filename={certFile}
                    filenamePlaceholder="Upload the X.509 certificate"
                    browseButtonText="Upload"
                    hideDefaultPreview
                    onFileInputChange={(_e, file) => {
                      setCertFile(file.name);
                      readFileBytes(file).then((b) => (certBytes.current = b)).catch(() => setError('Could not read the certificate file.'));
                    }}
                    onClearClick={() => { setCertFile(''); certBytes.current = null; }}
                    filenameAriaLabel="Certificate file name"
                  />
                </FormGroup>
                <FormGroup label="Private key" fieldId="key-file">
                  <FileUpload
                    id="key-file"
                    type="dataURL"
                    filename={keyFile}
                    filenamePlaceholder="Upload the matching private key"
                    browseButtonText="Upload"
                    hideDefaultPreview
                    onFileInputChange={(_e, file) => {
                      setKeyFile(file.name);
                      readFileBytes(file).then((b) => (keyBytes.current = b)).catch(() => setError('Could not read the private key file.'));
                    }}
                    onClearClick={() => { setKeyFile(''); keyBytes.current = null; }}
                    filenameAriaLabel="Private key file name"
                  />
                </FormGroup>
                <Button variant="primary" onClick={importCert} isDisabled={certFile === '' || keyFile === ''}>
                  Import certificate
                </Button>
              </Form>
            </StackItem>
          </Stack>
        )}
      </CardBody>

      <CertificateModal certBin={cert} isOpen={viewOpen} onClose={() => setViewOpen(false)} />

      <Modal
        variant={ModalVariant.small}
        isOpen={regenOpen}
        onClose={() => !regenerating && setRegenOpen(false)}
      >
        <ModalHeader title="Regenerate self-signed certificate" />
        <ModalBody>
          <Content component="p">A new self-signed certificate is generated with the common name (CN) you specify. Set the CN to the hostname clients use to reach this server (important for SSTP).</Content>
          <Form>
            <FormGroup label="Common name (CN)" fieldId="regen-cn">
              <TextInput id="regen-cn" value={cn} onChange={(_e, v) => setCn(v)} aria-label="Common name" />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={regenerate}
            isDisabled={cn.trim() === '' || regenerating}
            isLoading={regenerating}
          >
            Regenerate
          </Button>
          <Button variant="link" onClick={() => setRegenOpen(false)} isDisabled={regenerating}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Card>
  );
};

// --- Encryption algorithm ---------------------------------------------------

const CipherCard: React.FunctionComponent = () => {
  const [cipher, setCipher] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    api.GetServerCipher().then((r) => setCipher(r.String_str)).catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const save = () => {
    if (cipher === null) return;
    setSaving(true);
    api.SetServerCipher(new VPN.VpnRpcStr({ String_str: cipher })).then(() => setSaving(false)).catch((e) => { setError(String(e)); setSaving(false); });
  };

  return (
    <Card>
      <CardTitle>Encryption algorithm</CardTitle>
      <CardBody>
        {error && <Alert variant="danger" title="Could not load or save the cipher" isInline style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>{error}</Alert>}
        {cipher === null ? (
          <Bullseye><Spinner size="lg" aria-label="Loading cipher" /></Bullseye>
        ) : (
          <Form>
            <FormGroup label="Cipher for SSL connections" fieldId="cipher">
              <FormSelect id="cipher" value={cipher} onChange={(_e, v) => setCipher(v)} aria-label="Cipher">
                {(CIPHERS.includes(cipher) ? CIPHERS : [cipher, ...CIPHERS]).map((c) => (
                  <FormSelectOption key={c} value={c} label={c} />
                ))}
              </FormSelect>
            </FormGroup>
            <Button variant="primary" onClick={save} isDisabled={saving} isLoading={saving}>Save</Button>
          </Form>
        )}
      </CardBody>
    </Card>
  );
};

// --- Keep alive -------------------------------------------------------------

const KeepAliveCard: React.FunctionComponent = () => {
  const [keep, setKeep] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    api.GetKeep(new VPN.VpnRpcKeep()).then((r) => setKeep(r as unknown as Record<string, unknown>)).catch((e) => setError(String(e)));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const setField = (k: string, v: unknown) => setKeep((prev) => (prev ? { ...prev, [k]: v } : prev));
  const save = () => {
    if (!keep) return;
    setSaving(true);
    api.SetKeep(new VPN.VpnRpcKeep(keep as Partial<VPN.VpnRpcKeep>)).then(() => { setSaving(false); load(); }).catch((e) => { setError(String(e)); setSaving(false); });
  };

  const enabled = keep?.UseKeepConnect_bool === true;

  return (
    <Card>
      <CardTitle>Keep alive internet connection</CardTitle>
      <CardBody>
        {error && <Alert variant="danger" title="Could not load or save keep-alive" isInline style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>{error}</Alert>}
        {keep === null ? (
          <Bullseye><Spinner size="lg" aria-label="Loading keep-alive" /></Bullseye>
        ) : (
          <Form>
            <Switch id="keep" label="Send keep-alive packets to keep the internet connection alive" isChecked={enabled} onChange={(_e, c) => setField('UseKeepConnect_bool', c)} />
            <FormGroup label="Host name" fieldId="keep-host">
              <TextInput id="keep-host" value={String(keep.KeepConnectHost_str ?? '')} onChange={(_e, v) => setField('KeepConnectHost_str', v)} isDisabled={!enabled} aria-label="Keep-alive host name" />
            </FormGroup>
            <FormGroup label="Port" fieldId="keep-port">
              <TextInput type="number" id="keep-port" min={1} max={65535} value={String(keep.KeepConnectPort_u32 ?? 0)} onChange={(_e, v) => setField('KeepConnectPort_u32', Number(v) || 0)} isDisabled={!enabled} aria-label="Keep-alive port" />
            </FormGroup>
            <FormGroup label="Protocol" fieldId="keep-proto">
              <FormSelect id="keep-proto" value={String(keep.KeepConnectProtocol_u32 ?? 0)} onChange={(_e, v) => setField('KeepConnectProtocol_u32', Number(v))} isDisabled={!enabled} aria-label="Keep-alive protocol">
                <FormSelectOption value="0" label="TCP" />
                <FormSelectOption value="1" label="UDP" />
              </FormSelect>
            </FormGroup>
            <FormGroup label="Interval (seconds)" fieldId="keep-interval">
              <TextInput type="number" id="keep-interval" min={1} value={String(keep.KeepConnectInterval_u32 ?? 0)} onChange={(_e, v) => setField('KeepConnectInterval_u32', Number(v) || 0)} isDisabled={!enabled} aria-label="Keep-alive interval" />
            </FormGroup>
            <Button variant="primary" onClick={save} isDisabled={saving} isLoading={saving}>Save</Button>
          </Form>
        )}
      </CardBody>
    </Card>
  );
};

// --- Syslog -----------------------------------------------------------------

const SyslogCard: React.FunctionComponent = () => {
  const [syslog, setSyslog] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    api
      .GetSysLog(new VPN.VpnSyslogSetting())
      .then((r) => {
        const s = r as unknown as Record<string, unknown>;
        // Default to the standard syslog port so an enabled config is never
        // saved with port 0 (which the server rejects, reverting to Disabled).
        if (!s.Port_u32) {
          s.Port_u32 = 514;
        }
        setSyslog(s);
      })
      .catch((e) => setError(String(e)));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const setField = (k: string, v: unknown) => setSyslog((prev) => (prev ? { ...prev, [k]: v } : prev));

  const enabled = Number(syslog?.SaveType_u32 ?? 0) !== 0;
  const host = String(syslog?.Hostname_str ?? '');
  const port = Number(syslog?.Port_u32 ?? 0);
  const hostValid = !enabled || host.trim() !== '';
  const portValid = !enabled || (port >= 1 && port <= 65535);
  const valid = hostValid && portValid;

  const save = () => {
    if (!syslog || !valid) return;
    setSaving(true);
    api.SetSysLog(new VPN.VpnSyslogSetting(syslog as Partial<VPN.VpnSyslogSetting>)).then(() => { setSaving(false); load(); }).catch((e) => { setError(String(e)); setSaving(false); });
  };

  return (
    <Card>
      <CardTitle>Syslog</CardTitle>
      <CardBody>
        {error && <Alert variant="danger" title="Could not load or save syslog settings" isInline style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>{error}</Alert>}
        {syslog === null ? (
          <Bullseye><Spinner size="lg" aria-label="Loading syslog" /></Bullseye>
        ) : (
          <Form>
            <FormGroup label="Send to a syslog server" fieldId="syslog-type">
              <FormSelect id="syslog-type" value={String(syslog.SaveType_u32 ?? 0)} onChange={(_e, v) => setField('SaveType_u32', Number(v))} aria-label="Syslog save type">
                <FormSelectOption value="0" label="Disabled" />
                <FormSelectOption value="1" label="Server logs" />
                <FormSelectOption value="2" label="Server and Virtual Hub security logs" />
                <FormSelectOption value="3" label="Server and Virtual Hub all logs" />
              </FormSelect>
            </FormGroup>
            <FormGroup label="Syslog host name" fieldId="syslog-host">
              <TextInput id="syslog-host" value={host} onChange={(_e, v) => setField('Hostname_str', v)} isDisabled={!enabled} validated={hostValid ? 'default' : 'error'} aria-label="Syslog host name" />
              {!hostValid && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">Enter the syslog server host name.</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            <FormGroup label="Port" fieldId="syslog-port">
              <TextInput type="number" id="syslog-port" min={1} max={65535} value={String(syslog.Port_u32 ?? 514)} onChange={(_e, v) => setField('Port_u32', Number(v) || 0)} isDisabled={!enabled} validated={portValid ? 'default' : 'error'} aria-label="Syslog port" />
              {!portValid && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">Enter a port between 1 and 65535.</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
            <Button variant="primary" onClick={save} isDisabled={saving || !valid} isLoading={saving}>Save</Button>
          </Form>
        )}
      </CardBody>
    </Card>
  );
};

// --- VPN over ICMP / DNS ----------------------------------------------------

const SpecialListenerCard: React.FunctionComponent = () => {
  const [listener, setListener] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    api.GetSpecialListener().then((r) => setListener(r as unknown as Record<string, unknown>)).catch((e) => setError(String(e)));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const setField = (k: string, v: unknown) => setListener((prev) => (prev ? { ...prev, [k]: v } : prev));
  const save = () => {
    if (!listener) return;
    setSaving(true);
    api.SetSpecialListener(new VPN.VpnRpcSpecialListener(listener as Partial<VPN.VpnRpcSpecialListener>)).then(() => { setSaving(false); load(); }).catch((e) => { setError(String(e)); setSaving(false); });
  };

  return (
    <Card>
      <CardTitle>VPN over ICMP / DNS</CardTitle>
      <CardBody>
        {error && <Alert variant="danger" title="Could not load or save VPN over ICMP/DNS" isInline style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>{error}</Alert>}
        {listener === null ? (
          <Bullseye><Spinner size="lg" aria-label="Loading VPN over ICMP/DNS" /></Bullseye>
        ) : (
          <Form>
            <Switch id="vpn-icmp" label="Enable VPN over ICMP" isChecked={listener.VpnOverIcmpListener_bool === true} onChange={(_e, c) => setField('VpnOverIcmpListener_bool', c)} />
            <Switch id="vpn-dns" label="Enable VPN over DNS (UDP port 53)" isChecked={listener.VpnOverDnsListener_bool === true} onChange={(_e, c) => setField('VpnOverDnsListener_bool', c)} />
            <Button variant="primary" onClick={save} isDisabled={saving} isLoading={saving}>Save</Button>
          </Form>
        )}
      </CardBody>
    </Card>
  );
};

const EncryptionNetwork: React.FunctionComponent = () => (
  <AppPage
    title="Encryption And Network"
    description="Server administrator password, SSL certificate and cipher, and the network options that reach clients behind restrictive firewalls."
  >
    <Stack hasGutter>
      <StackItem><AdminPasswordCard /></StackItem>
      <StackItem><ServerCertCard /></StackItem>
      <StackItem><CipherCard /></StackItem>
      <StackItem><KeepAliveCard /></StackItem>
      <StackItem><SyslogCard /></StackItem>
      <StackItem><SpecialListenerCard /></StackItem>
    </Stack>
  </AppPage>
);

export { EncryptionNetwork };
