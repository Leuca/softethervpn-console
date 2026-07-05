import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
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
import { KeyValueTable } from '@app/components/KeyValueTable';
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

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusState | null>(null);

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

  // Read the private key; sent as-is (no client-side key parsing available).
  const onKeySelected = (_event: unknown, file: File) => {
    setKeyFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setKeyBytes(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => setKeyBytes(null);
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
    authComplete;

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
      MaxConnection_u32: 1,
      UseEncrypt_bool: true,
      AuthType_u32: authType,
    });
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

      {/* Create cascade */}
      <Modal variant={ModalVariant.small} isOpen={createOpen} onClose={() => setCreateOpen(false)}>
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
                    }}
                    dropzoneProps={{ accept: { 'application/octet-stream': ['.key', '.pem', '.der'] } }}
                    filenameAriaLabel="Private key file name"
                  />
                </FormGroup>
              </>
            )}
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
    </Flex>
  );
};

export { Cascade };
