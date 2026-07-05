import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  ExpandableSection,
  FileUpload,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { PlusCircleIcon, SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { CertificateModal } from '@app/CertificateViewer/CertificateViewer';
import { KeyValueTable } from '@app/components/KeyValueTable';
import { binToBytes } from '@app/utils/blob_utils';
import { formatOptionalDate } from '@app/utils/format';
import { hashSoftEtherPassword } from '@app/utils/sha0';
import { parseCertificate } from '@app/utils/x509';

// Cascade client-auth methods. RADIUS / NT domain auth is the plain-password
// type (the server forwards the plaintext); "standard" password auth is SHA-0
// hashed client-side and only works against local hub users.
const LINK_AUTH_TYPES = [
  { value: VPN.VpnRpcClientAuthType.Anonymous, label: 'Anonymous' },
  { value: VPN.VpnRpcClientAuthType.SHA0_Hashed_Password, label: 'Standard password' },
  { value: VPN.VpnRpcClientAuthType.PlainPassword, label: 'RADIUS / NT domain (plain password)' },
  { value: VPN.VpnRpcClientAuthType.Cert, label: 'Client certificate' },
];

const authTypeLabel = (t: unknown): string =>
  LINK_AUTH_TYPES.find((a) => a.value === Number(t))?.label ?? `Type ${t}`;

// _bin fields round-tripped from GetLink arrive as base64 strings; convert to
// real bytes before SetLink so the client does not double-encode them.
const LINK_BIN_KEYS = ['HashedPassword_bin', 'ClientX_bin', 'ClientK_bin', 'ServerCert_bin'];

// Advanced tuning defaults for a new cascade (mirror the native client).
const ADVANCED_DEFAULTS: Record<string, number | boolean> = {
  MaxConnection_u32: 1,
  UseEncrypt_bool: true,
  UseCompress_bool: false,
  HalfConnection_bool: false,
  DisableQoS_bool: false,
  NoUdpAcceleration_bool: false,
  NoTls1_bool: false,
  AdditionalConnectionInterval_u32: 1,
  ConnectionDisconnectSpan_u32: 0,
};

// Shared advanced-settings block for the create and edit forms. `get`/`set` bind
// it either to local create state or to the working edit object.
const AdvancedFields: React.FunctionComponent<{
  idPrefix: string;
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}> = ({ idPrefix, get, set }) => {
  const bool = (key: string) => Boolean(get(key));
  const checkbox = (key: string, label: string) => (
    <Checkbox
      id={`${idPrefix}-${key}`}
      label={label}
      isChecked={bool(key)}
      onChange={(_event, checked) => set(key, checked)}
    />
  );
  // Number fields hold the raw string while editing (so the field can be cleared)
  // and are coerced to integers at save time by coerceLinkNumbers.
  const numField = (key: string, label: string, fallback: number, ariaLabel: string) => (
    <FormGroup label={label} fieldId={`${idPrefix}-${key}`}>
      <TextInput
        type="number"
        id={`${idPrefix}-${key}`}
        value={String(get(key) ?? fallback)}
        onChange={(_event, value) => set(key, value)}
        aria-label={ariaLabel}
      />
    </FormGroup>
  );
  return (
    <ExpandableSection toggleText="Advanced settings">
      {numField('MaxConnection_u32', 'Number of TCP connections', 1, 'Number of TCP connections')}
      {checkbox('UseEncrypt_bool', 'Encrypt the VPN communication')}
      {checkbox('UseCompress_bool', 'Compress the data')}
      {checkbox('HalfConnection_bool', 'Use half-duplex mode (with multiple connections)')}
      {checkbox('DisableQoS_bool', 'Disable VoIP / QoS control')}
      {checkbox('NoUdpAcceleration_bool', 'Disable UDP acceleration')}
      {checkbox('NoTls1_bool', 'Do not use TLS 1.0')}
      {numField('AdditionalConnectionInterval_u32', 'Additional connection interval (seconds)', 1, 'Additional connection interval')}
      {numField('ConnectionDisconnectSpan_u32', 'Connection life of each TCP connection (seconds, 0 = no expiry)', 0, 'Connection life')}
    </ExpandableSection>
  );
};

// Coerce the advanced numeric fields (held as strings while editing) to valid
// integers before sending. MaxConnection and interval are at least 1; the
// connection-life span may be 0 (no expiry).
const coerceLinkNumbers = (obj: Record<string, unknown>): void => {
  const asInt = (value: unknown, min: number): number => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= min ? n : min;
  };
  if ('MaxConnection_u32' in obj) obj.MaxConnection_u32 = asInt(obj.MaxConnection_u32, 1);
  if ('AdditionalConnectionInterval_u32' in obj) obj.AdditionalConnectionInterval_u32 = asInt(obj.AdditionalConnectionInterval_u32, 1);
  if ('ConnectionDisconnectSpan_u32' in obj) obj.ConnectionDisconnectSpan_u32 = asInt(obj.ConnectionDisconnectSpan_u32, 0);
  if ('ProxyPort_u32' in obj) obj.ProxyPort_u32 = asInt(obj.ProxyPort_u32, 0);
};

const PROXY_TYPES = [
  { value: VPN.VpnRpcProxyType.Direct, label: 'Direct (no proxy)' },
  { value: VPN.VpnRpcProxyType.HTTP, label: 'HTTP proxy' },
  { value: VPN.VpnRpcProxyType.SOCKS, label: 'SOCKS proxy' },
];

// A proxy config is complete when it is Direct, or has a host and a valid port.
const proxyComplete = (get: (key: string) => unknown): boolean => {
  if ((Number(get('ProxyType_u32')) || 0) === VPN.VpnRpcProxyType.Direct) {
    return true;
  }
  const host = String(get('ProxyName_str') ?? '').trim();
  const port = Number(get('ProxyPort_u32'));
  return host.length > 0 && Number.isInteger(port) && port >= 1 && port <= 65535;
};

// Shared proxy block for the create and edit forms.
const ProxyFields: React.FunctionComponent<{
  idPrefix: string;
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}> = ({ idPrefix, get, set }) => {
  const type = Number(get('ProxyType_u32')) || 0;
  return (
    <ExpandableSection toggleText="Proxy">
      <FormGroup label="Proxy type" fieldId={`${idPrefix}-proxytype`}>
        <FormSelect
          id={`${idPrefix}-proxytype`}
          value={type}
          onChange={(_event, value) => set('ProxyType_u32', Number(value))}
          aria-label="Proxy type"
        >
          {PROXY_TYPES.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>
      {type !== VPN.VpnRpcProxyType.Direct && (
        <>
          <FormGroup label="Proxy host" isRequired fieldId={`${idPrefix}-proxyhost`}>
            <TextInput
              isRequired
              id={`${idPrefix}-proxyhost`}
              value={String(get('ProxyName_str') ?? '')}
              onChange={(_event, value) => set('ProxyName_str', value)}
              aria-label="Proxy host"
            />
          </FormGroup>
          <FormGroup label="Proxy port" isRequired fieldId={`${idPrefix}-proxyport`}>
            <TextInput
              isRequired
              type="number"
              id={`${idPrefix}-proxyport`}
              value={String(get('ProxyPort_u32') ?? '')}
              onChange={(_event, value) => set('ProxyPort_u32', value)}
              aria-label="Proxy port"
            />
          </FormGroup>
          <FormGroup label="Proxy username" fieldId={`${idPrefix}-proxyuser`}>
            <TextInput
              id={`${idPrefix}-proxyuser`}
              value={String(get('ProxyUsername_str') ?? '')}
              onChange={(_event, value) => set('ProxyUsername_str', value)}
              aria-label="Proxy username"
            />
          </FormGroup>
          <FormGroup label="Proxy password" fieldId={`${idPrefix}-proxypass`}>
            <TextInput
              type="password"
              id={`${idPrefix}-proxypass`}
              value={String(get('ProxyPassword_str') ?? '')}
              onChange={(_event, value) => set('ProxyPassword_str', value)}
              aria-label="Proxy password"
            />
          </FormGroup>
        </>
      )}
    </ExpandableSection>
  );
};

// GetLinkStatus returns many fields; surface the connection summary only.
const STATUS_KEYS = [
  'Connected_bool',
  'ServerName_str',
  'ServerPort_u32',
  'ServerProductName_str',
  'NumConnectionsEatablished_u32',
  'NumTcpConnections_u32',
  'StartTime_dt',
  'CurrentConnectionEstablishTime_dt',
];

type StatusLabel = { text: string; color: 'green' | 'grey' | 'red' | 'blue' };

// A cascade is offline (administratively down), connected, retrying after an
// error, or connecting. LastError_u32 is a SoftEther error code (0 = none).
const linkStatus = (l: VPN.VpnRpcEnumLinkItem): StatusLabel => {
  if (!l.Online_bool) {
    return { text: 'Offline', color: 'grey' };
  }
  if (l.Connected_bool) {
    return { text: 'Connected', color: 'green' };
  }
  if (l.LastError_u32) {
    return { text: `Error (code ${l.LastError_u32})`, color: 'red' };
  }
  return { text: 'Connecting', color: 'blue' };
};

interface StatusState {
  name: string;
  status: Record<string, unknown> | null;
  error: string | null;
}

const Cascade: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [links, setLinks] = React.useState<VPN.VpnRpcEnumLinkItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState('443');
  const [destHub, setDestHub] = React.useState('');
  const [authType, setAuthType] = React.useState<number>(VPN.VpnRpcClientAuthType.Anonymous);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  // Client certificate auth: the certificate (ClientX) and its private key (ClientK).
  const [certFilename, setCertFilename] = React.useState('');
  const [certBytes, setCertBytes] = React.useState<Uint8Array | null>(null);
  const [certError, setCertError] = React.useState<string | null>(null);
  const [keyFilename, setKeyFilename] = React.useState('');
  const [keyBytes, setKeyBytes] = React.useState<Uint8Array | null>(null);
  const [keyError, setKeyError] = React.useState<string | null>(null);
  // Server certificate verification (CheckServerCert + optional pinned ServerCert).
  const [checkServerCert, setCheckServerCert] = React.useState(false);
  const [serverCertFilename, setServerCertFilename] = React.useState('');
  const [serverCertBytes, setServerCertBytes] = React.useState<Uint8Array | null>(null);
  const [serverCertError, setServerCertError] = React.useState<string | null>(null);
  // Certificate to show in the shared viewer (staged-create or loaded-edit bytes).
  const [viewCert, setViewCert] = React.useState<Uint8Array | string | null>(null);
  // Advanced tuning for a new cascade.
  const [advanced, setAdvanced] = React.useState<Record<string, number | boolean>>({ ...ADVANCED_DEFAULTS });
  // Proxy config for a new cascade.
  const [proxy, setProxy] = React.useState<Record<string, unknown>>({ ProxyType_u32: VPN.VpnRpcProxyType.Direct });

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusState | null>(null);
  // Working copy of the cascade being edited (the full GetLink response).
  const [edit, setEdit] = React.useState<Record<string, unknown> | null>(null);

  const load = React.useCallback(() => {
    setLinks(null);
    setError(null);
    api
      .EnumLink(new VPN.VpnRpcEnumLink({ HubName_str: hub }))
      .then((response) => setLinks(response.LinkList ?? []))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setHost('');
    setPort('443');
    setDestHub('');
    setAuthType(VPN.VpnRpcClientAuthType.Anonymous);
    setUsername('');
    setPassword('');
    setCertFilename('');
    setCertBytes(null);
    setCertError(null);
    setKeyFilename('');
    setKeyBytes(null);
    setKeyError(null);
    setCheckServerCert(false);
    setServerCertFilename('');
    setServerCertBytes(null);
    setServerCertError(null);
    setAdvanced({ ...ADVANCED_DEFAULTS });
    setProxy({ ProxyType_u32: VPN.VpnRpcProxyType.Direct });
    setCreateOpen(true);
  };

  const { Anonymous, SHA0_Hashed_Password, PlainPassword, Cert } = VPN.VpnRpcClientAuthType;

  // Read a cascade client certificate; validate it parses before staging bytes.
  const onCertSelected = (_event: unknown, file: File) => {
    setCertError(null);
    setCertFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        parseCertificate(bytes); // throws if not a certificate
        setCertBytes(bytes);
      } catch {
        setCertError('The file is not a valid certificate (PEM or DER).');
        setCertBytes(null);
      }
    };
    reader.onerror = () => setCertError('The certificate file could not be read.');
    reader.readAsArrayBuffer(file);
  };

  // Read the private key and send its bytes as-is. The RPC decodes the key with
  // no passphrase (InRpcClientAuth -> BufToK(..., NULL)), so an encrypted key
  // would fail silently server-side; detect the PEM encryption markers and
  // reject with a clear message. In-browser decryption is not yet supported.
  const onKeySelected = (_event: unknown, file: File) => {
    setKeyError(null);
    setKeyFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      const text = new TextDecoder('latin1').decode(bytes);
      if (/ENCRYPTED PRIVATE KEY|Proc-Type:\s*4,\s*ENCRYPTED|DEK-Info:/i.test(text)) {
        setKeyError('Encrypted (password-protected) private keys are not supported yet. Provide an unencrypted key.');
        setKeyBytes(null);
        return;
      }
      setKeyBytes(bytes);
    };
    reader.onerror = () => {
      setKeyError('The private key file could not be read.');
      setKeyBytes(null);
    };
    reader.readAsArrayBuffer(file);
  };

  // Read a pinned server certificate; validate it parses before staging bytes.
  const onServerCertSelected = (_event: unknown, file: File) => {
    setServerCertError(null);
    setServerCertFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        parseCertificate(bytes);
        setServerCertBytes(bytes);
      } catch {
        setServerCertError('The file is not a valid certificate (PEM or DER).');
        setServerCertBytes(null);
      }
    };
    reader.onerror = () => setServerCertError('The certificate file could not be read.');
    reader.readAsArrayBuffer(file);
  };

  const portNum = Number(port);
  const needsUsername = authType === SHA0_Hashed_Password || authType === PlainPassword || authType === Cert;
  const authComplete =
    authType === Anonymous ||
    // Password is not trimmed: leading/trailing spaces can be significant.
    ((authType === SHA0_Hashed_Password || authType === PlainPassword) &&
      username.trim().length > 0 &&
      password.length > 0) ||
    (authType === Cert && username.trim().length > 0 && certBytes !== null && keyBytes !== null);
  const canCreate =
    name.trim().length > 0 &&
    host.trim().length > 0 &&
    destHub.trim().length > 0 &&
    Number.isInteger(portNum) &&
    portNum >= 1 &&
    portNum <= 65535 &&
    authComplete &&
    proxyComplete((key) => proxy[key]);

  const create = () => {
    const link = new VPN.VpnRpcCreateLink({
      // HubName_Ex_str is the LOCAL hub hosting the cascade; HubName_str is the
      // destination hub on the remote server (the API is asymmetric).
      HubName_Ex_str: hub,
      Online_bool: true,
      AccountName_utf: name.trim(),
      Hostname_str: host.trim(),
      Port_u32: portNum,
      HubName_str: destHub.trim(),
      CheckServerCert_bool: checkServerCert,
      AuthType_u32: authType,
      ...advanced,
      ...proxy,
    });
    coerceLinkNumbers(link as unknown as Record<string, unknown>);
    if (checkServerCert && serverCertBytes) {
      link.ServerCert_bin = serverCertBytes;
    }
    // Fill only the fields the chosen auth method uses. _bin fields are handed
    // real Uint8Arrays; the client base64-encodes them on send.
    if (authType === SHA0_Hashed_Password) {
      link.Username_str = username.trim();
      link.HashedPassword_bin = hashSoftEtherPassword(username.trim(), password);
    } else if (authType === PlainPassword) {
      link.Username_str = username.trim();
      link.PlainPassword_str = password;
    } else if (authType === Cert && certBytes && keyBytes) {
      link.Username_str = username.trim();
      link.ClientX_bin = certBytes;
      link.ClientK_bin = keyBytes;
    }
    api
      .CreateLink(link)
      .then(() => {
        setCreateOpen(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setCreateOpen(false);
      });
  };

  const setOnline = (accountName: string, online: boolean) => {
    const param = new VPN.VpnRpcLink({ HubName_str: hub, AccountName_utf: accountName });
    (online ? api.SetLinkOnline(param) : api.SetLinkOffline(param))
      .then(() => load())
      .catch((e) => setError(String(e)));
  };

  const openStatus = (accountName: string) => {
    setStatus({ name: accountName, status: null, error: null });
    api
      .GetLinkStatus(new VPN.VpnRpcLinkStatus({ HubName_Ex_str: hub, AccountName_utf: accountName }))
      .then((response) => {
        const raw = response as unknown as Record<string, unknown>;
        const subset: Record<string, unknown> = {};
        for (const key of STATUS_KEYS) {
          if (key in raw) {
            subset[key] = raw[key];
          }
        }
        setStatus({ name: accountName, status: subset, error: null });
      })
      .catch((e) => setStatus({ name: accountName, status: null, error: String(e) }));
  };

  // Load the full cascade config for inspection / editing. GetLink is keyed by
  // the local hub (HubName_Ex_str) and the account name.
  const openEdit = (accountName: string) => {
    api
      .GetLink(new VPN.VpnRpcCreateLink({ HubName_Ex_str: hub, AccountName_utf: accountName }))
      .then((response) => setEdit(response as unknown as Record<string, unknown>))
      .catch((e) => setError(String(e)));
  };

  const setEditField = (key: string, value: unknown) => setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));

  const saveEdit = () => {
    if (!edit) {
      return;
    }
    // Round-trip the full object so auth secrets, proxy, advanced options and
    // policy survive; only the destination fields are edited here. Normalize the
    // _bin fields (base64 on read) back to bytes so they are not double-encoded.
    const obj = new VPN.VpnRpcCreateLink(edit as Partial<VPN.VpnRpcCreateLink>);
    obj.HubName_Ex_str = hub;
    coerceLinkNumbers(obj as unknown as Record<string, unknown>);
    for (const key of LINK_BIN_KEYS) {
      const bytes = binToBytes(edit[key]);
      if (bytes) {
        (obj as unknown as Record<string, unknown>)[key] = bytes;
      } else {
        delete (obj as unknown as Record<string, unknown>)[key];
      }
    }
    api
      .SetLink(obj)
      .then(() => {
        setEdit(null);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setEdit(null);
      });
  };

  const confirmDelete = () => {
    if (pendingDelete === null) {
      return;
    }
    const accountName = pendingDelete;
    setPendingDelete(null);
    api
      .DeleteLink(new VPN.VpnRpcLink({ HubName_str: hub, AccountName_utf: accountName }))
      .then(() => load())
      .catch((e) => setError(String(e)));
  };

  const isLoading = links === null && error === null;

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading}>
            Refresh
          </Button>
        </FlexItem>
        <FlexItem>
          <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate} isDisabled={isLoading}>
            New cascade
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="Cascade operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading cascade connections" />
        </Bullseye>
      ) : links !== null && links.length === 0 ? (
        <EmptyState titleText="No cascade connections" headingLevel="h2">
          <EmptyStateBody>
            A cascade connection links this hub to a Virtual Hub on another VPN server, joining the two Layer 2
            segments.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate}>
                New cascade
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : links !== null ? (
        <Table aria-label="Cascade connections" variant="compact">
          <Thead>
            <Tr>
              <Th>Setting name</Th>
              <Th>Status</Th>
              <Th>Established</Th>
              <Th>Destination server</Th>
              <Th>Destination hub</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {links.map((l) => {
              const st = linkStatus(l);
              return (
                <Tr key={l.AccountName_utf}>
                  <Td dataLabel="Setting name">{l.AccountName_utf}</Td>
                  <Td dataLabel="Status">
                    <Label color={st.color} isCompact>
                      {st.text}
                    </Label>
                  </Td>
                  <Td dataLabel="Established">
                    {l.Connected_bool ? formatOptionalDate(l.ConnectedTime_dt, '-') : '-'}
                  </Td>
                  <Td dataLabel="Destination server">{l.Hostname_str}</Td>
                  <Td dataLabel="Destination hub">{l.TargetHubName_str}</Td>
                  <Td isActionCell>
                    <ActionsColumn
                      items={[
                        { title: 'Edit settings', onClick: () => openEdit(l.AccountName_utf) },
                        { title: 'Connection status', onClick: () => openStatus(l.AccountName_utf) },
                        l.Online_bool
                          ? { title: 'Set offline', onClick: () => setOnline(l.AccountName_utf, false) }
                          : { title: 'Set online', onClick: () => setOnline(l.AccountName_utf, true) },
                        { isSeparator: true },
                        { title: 'Delete', onClick: () => setPendingDelete(l.AccountName_utf) },
                      ]}
                    />
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      ) : null}

      {/* Create cascade (step aside while the cert viewer is open) */}
      <Modal variant={ModalVariant.small} isOpen={createOpen && viewCert === null} onClose={() => setCreateOpen(false)}>
        <ModalHeader title="New cascade connection" />
        <ModalBody>
          <Form>
            <FormGroup label="Setting name" isRequired fieldId="link-name">
              <TextInput
                isRequired
                id="link-name"
                value={name}
                onChange={(_event, value) => setName(value)}
                aria-label="Setting name"
              />
            </FormGroup>
            <FormGroup label="Destination server host" isRequired fieldId="link-host">
              <TextInput
                isRequired
                id="link-host"
                value={host}
                onChange={(_event, value) => setHost(value)}
                aria-label="Destination server host"
              />
            </FormGroup>
            <FormGroup label="Port" isRequired fieldId="link-port">
              <TextInput
                isRequired
                type="number"
                id="link-port"
                value={port}
                onChange={(_event, value) => setPort(value)}
                aria-label="Port"
              />
            </FormGroup>
            <FormGroup label="Destination virtual hub" isRequired fieldId="link-desthub">
              <TextInput
                isRequired
                id="link-desthub"
                value={destHub}
                onChange={(_event, value) => setDestHub(value)}
                aria-label="Destination virtual hub"
              />
            </FormGroup>
            <FormGroup label="Authentication" fieldId="link-auth">
              <FormSelect
                id="link-auth"
                value={authType}
                onChange={(_event, value) => setAuthType(Number(value))}
                aria-label="Authentication method"
              >
                {LINK_AUTH_TYPES.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
            </FormGroup>
            {needsUsername && (
              <FormGroup label="Username" isRequired fieldId="link-username">
                <TextInput
                  isRequired
                  id="link-username"
                  value={username}
                  onChange={(_event, value) => setUsername(value)}
                  aria-label="Username"
                />
              </FormGroup>
            )}
            {(authType === SHA0_Hashed_Password || authType === PlainPassword) && (
              <FormGroup label="Password" isRequired fieldId="link-password">
                <TextInput
                  isRequired
                  type="password"
                  id="link-password"
                  value={password}
                  onChange={(_event, value) => setPassword(value)}
                  aria-label="Password"
                />
              </FormGroup>
            )}
            {authType === Cert && (
              <>
                <FormGroup label="Client certificate" isRequired fieldId="link-cert">
                  <FileUpload
                    id="link-cert"
                    type="dataURL"
                    filename={certFilename}
                    filenamePlaceholder="Drag and drop or upload a certificate"
                    browseButtonText="Upload"
                    hideDefaultPreview
                    onFileInputChange={onCertSelected}
                    onClearClick={() => {
                      setCertFilename('');
                      setCertBytes(null);
                      setCertError(null);
                    }}
                    dropzoneProps={{ accept: { 'application/x-x509-ca-cert': ['.cer', '.crt', '.cert', '.pem'] } }}
                    filenameAriaLabel="Certificate file name"
                  />
                  {certError && (
                    <HelperText>
                      <HelperTextItem variant="error">{certError}</HelperTextItem>
                    </HelperText>
                  )}
                </FormGroup>
                <FormGroup label="Private key" isRequired fieldId="link-key">
                  <FileUpload
                    id="link-key"
                    type="dataURL"
                    filename={keyFilename}
                    filenamePlaceholder="Drag and drop or upload the private key"
                    browseButtonText="Upload"
                    hideDefaultPreview
                    onFileInputChange={onKeySelected}
                    onClearClick={() => {
                      setKeyFilename('');
                      setKeyBytes(null);
                      setKeyError(null);
                    }}
                    dropzoneProps={{ accept: { 'application/octet-stream': ['.key', '.pem', '.der'] } }}
                    filenameAriaLabel="Private key file name"
                  />
                  {keyError && (
                    <HelperText>
                      <HelperTextItem variant="error">{keyError}</HelperTextItem>
                    </HelperText>
                  )}
                </FormGroup>
              </>
            )}
            <FormGroup label="Server certificate" fieldId="link-servercert">
              <Checkbox
                id="link-checkservercert"
                label="Always verify the destination server certificate"
                isChecked={checkServerCert}
                onChange={(_event, checked) => setCheckServerCert(checked)}
              />
              {checkServerCert && (
                <>
                  <FileUpload
                    id="link-servercert"
                    type="dataURL"
                    filename={serverCertFilename}
                    filenamePlaceholder="Optionally pin a specific server certificate"
                    browseButtonText="Upload"
                    hideDefaultPreview
                    onFileInputChange={onServerCertSelected}
                    onClearClick={() => {
                      setServerCertFilename('');
                      setServerCertBytes(null);
                      setServerCertError(null);
                    }}
                    dropzoneProps={{ accept: { 'application/x-x509-ca-cert': ['.cer', '.crt', '.cert', '.pem'] } }}
                    filenameAriaLabel="Server certificate file name"
                  />
                  <HelperText>
                    <HelperTextItem variant={serverCertError ? 'error' : 'default'}>
                      {serverCertError ?? 'If pinned, the server must present exactly this certificate.'}
                    </HelperTextItem>
                  </HelperText>
                  {serverCertBytes && !serverCertError && (
                    <Button variant="link" isInline onClick={() => setViewCert(serverCertBytes)}>
                      View certificate
                    </Button>
                  )}
                </>
              )}
            </FormGroup>
            <ProxyFields
              idPrefix="link"
              get={(key) => proxy[key]}
              set={(key, value) => setProxy((prev) => ({ ...prev, [key]: value }))}
            />
            <AdvancedFields
              idPrefix="link"
              get={(key) => advanced[key]}
              set={(key, value) => setAdvanced((prev) => ({ ...prev, [key]: value as number | boolean }))}
            />
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={create} isDisabled={!canCreate}>
            Create
          </Button>
          <Button variant="link" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit / inspect cascade (step aside while the cert viewer is open) */}
      <Modal variant={ModalVariant.medium} isOpen={edit !== null && viewCert === null} onClose={() => setEdit(null)}>
        <ModalHeader title={edit ? `Cascade settings: ${String(edit.AccountName_utf ?? '')}` : ''} />
        <ModalBody>
          {edit && (
            <Form>
              <FormGroup label="Destination server host" isRequired fieldId="edit-host">
                <TextInput
                  isRequired
                  id="edit-host"
                  value={String(edit.Hostname_str ?? '')}
                  onChange={(_event, value) => setEditField('Hostname_str', value)}
                  aria-label="Destination server host"
                />
              </FormGroup>
              <FormGroup label="Port" isRequired fieldId="edit-port">
                <TextInput
                  isRequired
                  type="number"
                  id="edit-port"
                  value={String(edit.Port_u32 ?? '')}
                  onChange={(_event, value) => setEditField('Port_u32', Number(value) || 0)}
                  aria-label="Port"
                />
              </FormGroup>
              <FormGroup label="Destination virtual hub" isRequired fieldId="edit-desthub">
                <TextInput
                  isRequired
                  id="edit-desthub"
                  value={String(edit.HubName_str ?? '')}
                  onChange={(_event, value) => setEditField('HubName_str', value)}
                  aria-label="Destination virtual hub"
                />
              </FormGroup>
              <FormGroup label="Server certificate" fieldId="edit-servercert">
                <Checkbox
                  id="edit-checkservercert"
                  label="Always verify the destination server certificate"
                  isChecked={Boolean(edit.CheckServerCert_bool)}
                  onChange={(_event, checked) => setEditField('CheckServerCert_bool', checked)}
                />
                {binToBytes(edit.ServerCert_bin) && (
                  <Button
                    variant="link"
                    isInline
                    onClick={() => setViewCert(edit.ServerCert_bin as Uint8Array | string)}
                  >
                    View pinned certificate
                  </Button>
                )}
              </FormGroup>
              <ProxyFields idPrefix="edit" get={(key) => edit[key]} set={setEditField} />
              <AdvancedFields idPrefix="edit" get={(key) => edit[key]} set={setEditField} />
              <FormGroup label="Current configuration" fieldId="edit-inspect">
                <Table aria-label="Cascade configuration" variant="compact" borders={false}>
                  <Tbody>
                    <Tr>
                      <Td>Authentication</Td>
                      <Td>{authTypeLabel(edit.AuthType_u32)}</Td>
                    </Tr>
                    <Tr>
                      <Td>Username</Td>
                      <Td>{String(edit.Username_str || '-')}</Td>
                    </Tr>
                  </Tbody>
                </Table>
                <HelperText>
                  <HelperTextItem>Authentication is preserved on save; editing it here is coming next.</HelperTextItem>
                </HelperText>
              </FormGroup>
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={saveEdit}
            isDisabled={
              !edit ||
              String(edit.Hostname_str ?? '').trim().length === 0 ||
              String(edit.HubName_str ?? '').trim().length === 0 ||
              !(Number(edit.Port_u32) >= 1 && Number(edit.Port_u32) <= 65535) ||
              !proxyComplete((key) => edit[key])
            }
          >
            Save
          </Button>
          <Button variant="link" onClick={() => setEdit(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Connection status */}
      <Modal variant={ModalVariant.medium} isOpen={status !== null} onClose={() => setStatus(null)}>
        <ModalHeader title={status ? `Cascade status: ${status.name}` : ''} />
        <ModalBody>
          {status?.error ? (
            <Alert variant="danger" title="Could not load cascade status" isInline>
              {status.error}
            </Alert>
          ) : status?.status ? (
            <KeyValueTable data={status.status} ariaLabel={`Status for ${status.name}`} />
          ) : (
            <Bullseye>
              <Spinner size="lg" aria-label="Loading cascade status" />
            </Bullseye>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={() => setStatus(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete confirmation */}
      <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader title="Delete cascade connection" titleIconVariant="warning" />
        <ModalBody>
          Delete the cascade connection <strong>{pendingDelete}</strong>? If it is online it will be disconnected
          first.
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <CertificateModal certBin={viewCert} isOpen={viewCert !== null} onClose={() => setViewCert(null)} />
    </Flex>
  );
};

export { Cascade };
