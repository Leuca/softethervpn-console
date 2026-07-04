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
  FileUpload,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Icon,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { BanIcon, PlusCircleIcon, SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { CertificateModal } from '@app/CertificateViewer/CertificateViewer';
import { formatOptionalDate, userAuthTypeLabel } from '@app/utils/format';
import { parseCertificate } from '@app/utils/x509';

// A UserCert user's registered certificate (DER or PEM-text bytes), if any.
const certBytes = (value: unknown): Uint8Array | null =>
  value instanceof Uint8Array && value.length > 0 ? value : null;

// Auth types offered when creating a user; the rest need extra config, set on edit.
const CREATABLE_AUTH_TYPES = [
  { value: VPN.VpnRpcUserAuthType.Anonymous, label: 'Anonymous' },
  { value: VPN.VpnRpcUserAuthType.Password, label: 'Password' },
];

// All auth types, selectable when editing.
const ALL_AUTH_TYPES = [
  { value: VPN.VpnRpcUserAuthType.Anonymous, label: 'Anonymous' },
  { value: VPN.VpnRpcUserAuthType.Password, label: 'Password' },
  { value: VPN.VpnRpcUserAuthType.UserCert, label: 'User certificate' },
  { value: VPN.VpnRpcUserAuthType.RootCert, label: 'Root certificate' },
  { value: VPN.VpnRpcUserAuthType.Radius, label: 'RADIUS' },
  { value: VPN.VpnRpcUserAuthType.NTDomain, label: 'NT domain' },
];

// SoftEther stores "no expiry" as an epoch-era sentinel timestamp.
const isNeverDate = (value: unknown): boolean => {
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1970;
};
const NEVER = new Date(0).toISOString();
const toDateInput = (value: unknown): string =>
  isNeverDate(value) ? '' : new Date(value as string).toISOString().slice(0, 10);

const Users: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [users, setUsers] = React.useState<VPN.VpnRpcEnumUserItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [authType, setAuthType] = React.useState<number>(VPN.VpnRpcUserAuthType.Anonymous);
  const [password, setPassword] = React.useState('');
  const [realname, setRealname] = React.useState('');
  const [note, setNote] = React.useState('');

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  // Working copy of the user being edited (the full GetUser response) plus an
  // optional new password (blank = keep the current one).
  const [edit, setEdit] = React.useState<Record<string, unknown> | null>(null);
  const [newPassword, setNewPassword] = React.useState('');
  const [certOpen, setCertOpen] = React.useState(false);
  const [certFilename, setCertFilename] = React.useState('');
  const [certError, setCertError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setUsers(null);
    setError(null);
    api
      .EnumUser(new VPN.VpnRpcEnumUser({ HubName_str: hub }))
      .then((response) => setUsers(response.UserList ?? []))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setAuthType(VPN.VpnRpcUserAuthType.Anonymous);
    setPassword('');
    setRealname('');
    setNote('');
    setCreateOpen(true);
  };

  const canCreate = name.trim().length > 0;

  const create = () => {
    api
      .CreateUser(
        new VPN.VpnRpcSetUser({
          HubName_str: hub,
          Name_str: name.trim(),
          AuthType_u32: authType,
          Auth_Password_str: authType === VPN.VpnRpcUserAuthType.Password ? password : '',
          Realname_utf: realname,
          Note_utf: note,
        }),
      )
      .then(() => {
        setCreateOpen(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setCreateOpen(false);
      });
  };

  const openEdit = (userName: string) => {
    setNewPassword('');
    setCertFilename('');
    setCertError(null);
    api
      .GetUser(new VPN.VpnRpcSetUser({ HubName_str: hub, Name_str: userName }))
      .then((response) => setEdit(response as unknown as Record<string, unknown>))
      .catch((e) => setError(String(e)));
  };

  const setEditField = (key: string, value: unknown) => setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));

  // Read an uploaded certificate file, validate it parses, and stage its bytes
  // as the user's UserX_bin (the server accepts DER or PEM).
  const onCertSelected = (_event: unknown, file: File) => {
    setCertError(null);
    setCertFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        parseCertificate(bytes); // throws if not a certificate
        setEditField('UserX_bin', bytes);
      } catch {
        setCertError('The file is not a valid certificate (PEM or DER).');
        setEditField('UserX_bin', new Uint8Array());
      }
    };
    reader.onerror = () => setCertError('The certificate file could not be read.');
    reader.readAsArrayBuffer(file);
  };

  const clearCert = () => {
    setCertFilename('');
    setCertError(null);
    setEditField('UserX_bin', new Uint8Array());
  };

  const saveEdit = () => {
    if (!edit) {
      return;
    }
    // Build the class instance first (correct _bin serialization), then set the
    // password only when changing it - otherwise delete the key so it is not
    // serialized and the server keeps the current password.
    const obj = new VPN.VpnRpcSetUser(edit as Partial<VPN.VpnRpcSetUser>);
    if (Number(obj.AuthType_u32) === VPN.VpnRpcUserAuthType.Password && newPassword) {
      obj.Auth_Password_str = newPassword;
    } else {
      delete (obj as { Auth_Password_str?: string }).Auth_Password_str;
    }
    api
      .SetUser(obj)
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
    const userName = pendingDelete;
    setPendingDelete(null);
    api
      .DeleteUser(new VPN.VpnRpcDeleteUser({ HubName_str: hub, Name_str: userName }))
      .then(() => load())
      .catch((e) => setError(String(e)));
  };

  const isLoading = users === null && error === null;

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
            New user
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="User operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading users" />
        </Bullseye>
      ) : users !== null && users.length === 0 ? (
        <EmptyState titleText="No users" headingLevel="h2">
          <EmptyStateBody>Create a user to allow client connections to this hub.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate}>
                New user
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : users !== null ? (
        <Table aria-label="Users" variant="compact">
          <Thead>
            <Tr>
              <Th>User name</Th>
              <Th>Real name</Th>
              <Th>Group</Th>
              <Th>Auth method</Th>
              <Th>Logins</Th>
              <Th>Last login</Th>
              <Th>Expiration</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {users.map((user) => (
              <Tr key={user.Name_str}>
                <Td dataLabel="User name">
                  <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>{user.Name_str}</FlexItem>
                    {user.DenyAccess_bool && (
                      <FlexItem>
                        <Icon status="danger" title="Access denied">
                          <BanIcon />
                        </Icon>
                      </FlexItem>
                    )}
                  </Flex>
                </Td>
                <Td dataLabel="Real name">{user.Realname_utf || '-'}</Td>
                <Td dataLabel="Group">{user.GroupName_str || '-'}</Td>
                <Td dataLabel="Auth method">{userAuthTypeLabel(user.AuthType_u32)}</Td>
                <Td dataLabel="Logins">{user.NumLogin_u32.toLocaleString()}</Td>
                <Td dataLabel="Last login">{formatOptionalDate(user.LastLoginTime_dt, '-')}</Td>
                <Td dataLabel="Expiration">{formatOptionalDate(user.Expires_dt, 'Never')}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      { title: 'Edit', onClick: () => openEdit(user.Name_str) },
                      { isSeparator: true },
                      { title: 'Delete', onClick: () => setPendingDelete(user.Name_str) },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}

      {/* Create user */}
      <Modal variant={ModalVariant.small} isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <ModalHeader title="New user" />
        <ModalBody>
          <Form>
            <FormGroup label="User name" isRequired fieldId="user-name">
              <TextInput
                isRequired
                id="user-name"
                value={name}
                onChange={(_event, value) => setName(value)}
                aria-label="User name"
              />
            </FormGroup>
            <FormGroup label="Authentication" fieldId="user-auth">
              <FormSelect
                id="user-auth"
                value={authType}
                onChange={(_event, value) => setAuthType(Number(value))}
                aria-label="Authentication method"
              >
                {CREATABLE_AUTH_TYPES.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
            </FormGroup>
            {authType === VPN.VpnRpcUserAuthType.Password && (
              <FormGroup label="Password" fieldId="user-password">
                <TextInput
                  type="password"
                  id="user-password"
                  value={password}
                  onChange={(_event, value) => setPassword(value)}
                  aria-label="Password"
                />
              </FormGroup>
            )}
            <FormGroup label="Real name" fieldId="user-realname">
              <TextInput
                id="user-realname"
                value={realname}
                onChange={(_event, value) => setRealname(value)}
                aria-label="Real name"
              />
            </FormGroup>
            <FormGroup label="Note" fieldId="user-note">
              <TextInput id="user-note" value={note} onChange={(_event, value) => setNote(value)} aria-label="Note" />
            </FormGroup>
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

      {/* Edit user */}
      <Modal variant={ModalVariant.medium} isOpen={edit !== null} onClose={() => setEdit(null)}>
        <ModalHeader title={edit ? `Edit ${String(edit.Name_str)}` : ''} />
        <ModalBody>
          {edit && (
            <Form>
              <FormGroup label="Real name" fieldId="edit-realname">
                <TextInput
                  id="edit-realname"
                  value={String(edit.Realname_utf ?? '')}
                  onChange={(_event, value) => setEditField('Realname_utf', value)}
                  aria-label="Real name"
                />
              </FormGroup>
              <FormGroup label="Note" fieldId="edit-note">
                <TextInput
                  id="edit-note"
                  value={String(edit.Note_utf ?? '')}
                  onChange={(_event, value) => setEditField('Note_utf', value)}
                  aria-label="Note"
                />
              </FormGroup>
              <FormGroup label="Group" fieldId="edit-group">
                <TextInput
                  id="edit-group"
                  value={String(edit.GroupName_str ?? '')}
                  onChange={(_event, value) => setEditField('GroupName_str', value)}
                  aria-label="Group"
                />
              </FormGroup>
              <FormGroup label="Authentication" fieldId="edit-auth">
                <FormSelect
                  id="edit-auth"
                  value={Number(edit.AuthType_u32)}
                  onChange={(_event, value) => setEditField('AuthType_u32', Number(value))}
                  aria-label="Authentication method"
                >
                  {ALL_AUTH_TYPES.map((option) => (
                    <FormSelectOption key={option.value} value={option.value} label={option.label} />
                  ))}
                </FormSelect>
              </FormGroup>
              {Number(edit.AuthType_u32) === VPN.VpnRpcUserAuthType.Password && (
                <FormGroup label="New password" fieldId="edit-password">
                  <TextInput
                    type="password"
                    id="edit-password"
                    value={newPassword}
                    onChange={(_event, value) => setNewPassword(value)}
                    placeholder="Leave blank to keep the current password"
                    aria-label="New password"
                  />
                </FormGroup>
              )}
              {Number(edit.AuthType_u32) === VPN.VpnRpcUserAuthType.UserCert && (
                <FormGroup label="User certificate" fieldId="edit-usercert">
                  <HelperText>
                    <HelperTextItem>
                      The user may connect only with an SSL client certificate that exactly matches the one registered
                      here.
                    </HelperTextItem>
                  </HelperText>
                  <FileUpload
                    id="edit-usercert"
                    type="dataURL"
                    filename={certFilename}
                    filenamePlaceholder="Drag and drop or upload a certificate"
                    browseButtonText="Upload"
                    hideDefaultPreview
                    onFileInputChange={onCertSelected}
                    onClearClick={clearCert}
                    dropzoneProps={{ accept: { 'application/x-x509-ca-cert': ['.cer', '.crt', '.cert', '.pem'] } }}
                    filenameAriaLabel="Certificate file name"
                  />
                  {certError && (
                    <HelperText>
                      <HelperTextItem variant="error">{certError}</HelperTextItem>
                    </HelperText>
                  )}
                  {certBytes(edit.UserX_bin) && !certError && (
                    <Button
                      variant="link"
                      isInline
                      style={{ marginBlockStart: 'var(--pf-t--global--spacer--sm)' }}
                      onClick={() => setCertOpen(true)}
                    >
                      View registered certificate
                    </Button>
                  )}
                </FormGroup>
              )}
              {Number(edit.AuthType_u32) === VPN.VpnRpcUserAuthType.RootCert && (
                <FormGroup label="Common name (CN)" fieldId="edit-cn">
                  <TextInput
                    id="edit-cn"
                    value={String(edit.CommonName_utf ?? '')}
                    onChange={(_event, value) => setEditField('CommonName_utf', value)}
                    aria-label="Common name"
                  />
                </FormGroup>
              )}
              {Number(edit.AuthType_u32) === VPN.VpnRpcUserAuthType.Radius && (
                <FormGroup label="RADIUS username" fieldId="edit-radius">
                  <TextInput
                    id="edit-radius"
                    value={String(edit.RadiusUsername_utf ?? '')}
                    onChange={(_event, value) => setEditField('RadiusUsername_utf', value)}
                    aria-label="RADIUS username"
                  />
                </FormGroup>
              )}
              {Number(edit.AuthType_u32) === VPN.VpnRpcUserAuthType.NTDomain && (
                <FormGroup label="NT domain username" fieldId="edit-nt">
                  <TextInput
                    id="edit-nt"
                    value={String(edit.NtUsername_utf ?? '')}
                    onChange={(_event, value) => setEditField('NtUsername_utf', value)}
                    aria-label="NT domain username"
                  />
                </FormGroup>
              )}
              <FormGroup fieldId="edit-expires">
                <Checkbox
                  id="edit-expires"
                  label="Account expires"
                  isChecked={!isNeverDate(edit.ExpireTime_dt)}
                  onChange={(_event, checked) =>
                    setEditField('ExpireTime_dt', checked ? new Date(Date.now() + 365 * 864e5).toISOString() : NEVER)
                  }
                />
              </FormGroup>
              {!isNeverDate(edit.ExpireTime_dt) && (
                <FormGroup label="Expiration date" fieldId="edit-expiredate">
                  <TextInput
                    type="date"
                    id="edit-expiredate"
                    value={toDateInput(edit.ExpireTime_dt)}
                    onChange={(_event, value) =>
                      setEditField('ExpireTime_dt', value ? new Date(`${value}T00:00:00Z`).toISOString() : NEVER)
                    }
                    aria-label="Expiration date"
                  />
                </FormGroup>
              )}
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={saveEdit}>
            Save
          </Button>
          <Button variant="link" onClick={() => setEdit(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete confirmation */}
      <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader title="Delete user" titleIconVariant="warning" />
        <ModalBody>
          Delete the user <strong>{pendingDelete}</strong>? Any active sessions for this user will be disconnected.
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

      <CertificateModal
        certBin={edit ? certBytes(edit.UserX_bin) : null}
        isOpen={certOpen}
        onClose={() => setCertOpen(false)}
      />
    </Flex>
  );
};

export { Users };
