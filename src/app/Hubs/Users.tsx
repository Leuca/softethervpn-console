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
import { BanIcon, PlusCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { CertificateModal } from '@app/CertificateViewer/CertificateViewer';
import { SecurityPolicyModal } from '@app/Hubs/SecurityPolicyModal';
import { binToBytes } from '@app/utils/blob_utils';
import { recordChanged } from '@app/utils/dirty';
import { formatOptionalDate, userAuthTypeLabel } from '@app/utils/format';
import { parseCertificate } from '@app/utils/x509';

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
const hexFromBytes = (value: unknown): string => {
  const bytes = binToBytes(value);
  return bytes
    ? Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ')
    : '';
};
const compactHex = (value: string): string => value.replace(/[\s:.-]/g, '');
const parseSerial = (value: string): { bytes: Uint8Array; error: string | null } => {
  const hex = compactHex(value);
  if (!hex) {
    return { bytes: new Uint8Array(), error: null };
  }
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    return { bytes: new Uint8Array(), error: 'Serial number must be hexadecimal byte pairs.' };
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return { bytes, error: null };
};
const defaultPolicy = (): Record<string, unknown> => ({
  UsePolicy_bool: false,
  'policy:Access_bool': true,
  'policy:Ver3_bool': true,
});
const emptyUserDraft = (): Record<string, unknown> => ({
  ...defaultPolicy(),
  Name_str: '',
  GroupName_str: '',
  Realname_utf: '',
  Note_utf: '',
  AuthType_u32: VPN.VpnRpcUserAuthType.Anonymous,
  UserX_bin: new Uint8Array(),
  Serial_bin: new Uint8Array(),
  CommonName_utf: '',
  RadiusUsername_utf: '',
  NtUsername_utf: '',
  ExpireTime_dt: NEVER,
});

const userAuthValid = (
  user: Record<string, unknown>,
  certError: string | null,
  rootCommonNameEnabled: boolean,
  rootSerialEnabled: boolean,
  rootSerial: string,
): boolean => {
  const authType = Number(user.AuthType_u32) || 0;
  if (authType === VPN.VpnRpcUserAuthType.UserCert) {
    return binToBytes(user.UserX_bin) !== null && certError === null;
  }
  if (authType === VPN.VpnRpcUserAuthType.RootCert) {
    const serialResult = parseSerial(rootSerial);
    return (
      (!rootCommonNameEnabled || String(user.CommonName_utf ?? '').trim().length > 0) &&
      (!rootSerialEnabled || (serialResult.error === null && serialResult.bytes.length > 0))
    );
  }
  return true;
};

interface UserSettingsModalProps {
  mode: 'create' | 'edit';
  user: Record<string, unknown>;
  password: string;
  certFilename: string;
  certError: string | null;
  rootCommonNameEnabled: boolean;
  rootSerialEnabled: boolean;
  rootSerial: string;
  isOpen: boolean;
  isSubmitDisabled: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onField: (key: string, value: unknown) => void;
  onPassword: (value: string) => void;
  onCertSelected: (_event: unknown, file: File) => void;
  onClearCert: () => void;
  onViewCert: () => void;
  onRootCommonNameEnabled: (enabled: boolean) => void;
  onRootSerialEnabled: (enabled: boolean) => void;
  onRootSerial: (value: string) => void;
  onPolicy: () => void;
}

const UserSettingsModal: React.FunctionComponent<UserSettingsModalProps> = ({
  mode,
  user,
  password,
  certFilename,
  certError,
  rootCommonNameEnabled,
  rootSerialEnabled,
  rootSerial,
  isOpen,
  isSubmitDisabled,
  onClose,
  onSubmit,
  onField,
  onPassword,
  onCertSelected,
  onClearCert,
  onViewCert,
  onRootCommonNameEnabled,
  onRootSerialEnabled,
  onRootSerial,
  onPolicy,
}) => {
  const isCreate = mode === 'create';
  const authType = Number(user.AuthType_u32) || 0;
  const idPrefix = isCreate ? 'user' : 'edit';
  const certBytes = binToBytes(user.UserX_bin);
  const serialResult = parseSerial(rootSerial);
  const serialError =
    rootSerialEnabled && rootSerial.trim().length === 0
      ? 'Serial number is required when enabled.'
      : rootSerialEnabled
        ? serialResult.error
        : null;

  return (
    <Modal variant={ModalVariant.medium} isOpen={isOpen} onClose={onClose}>
      <ModalHeader title={isCreate ? 'New user' : `Edit ${String(user.Name_str)}`} />
      <ModalBody>
        <Form>
          {isCreate && (
            <FormGroup label="User name" isRequired fieldId={`${idPrefix}-name`}>
              <TextInput
                isRequired
                id={`${idPrefix}-name`}
                value={String(user.Name_str ?? '')}
                onChange={(_event, value) => onField('Name_str', value)}
                aria-label="User name"
              />
            </FormGroup>
          )}
          <FormGroup label="Real name" fieldId={`${idPrefix}-realname`}>
            <TextInput
              id={`${idPrefix}-realname`}
              value={String(user.Realname_utf ?? '')}
              onChange={(_event, value) => onField('Realname_utf', value)}
              aria-label="Real name"
            />
          </FormGroup>
          <FormGroup label="Note" fieldId={`${idPrefix}-note`}>
            <TextInput
              id={`${idPrefix}-note`}
              value={String(user.Note_utf ?? '')}
              onChange={(_event, value) => onField('Note_utf', value)}
              aria-label="Note"
            />
          </FormGroup>
          <FormGroup label="Group" fieldId={`${idPrefix}-group`}>
            <TextInput
              id={`${idPrefix}-group`}
              value={String(user.GroupName_str ?? '')}
              onChange={(_event, value) => onField('GroupName_str', value)}
              aria-label="Group"
            />
          </FormGroup>
          <FormGroup label="Authentication" fieldId={`${idPrefix}-auth`}>
            <FormSelect
              id={`${idPrefix}-auth`}
              value={authType}
              onChange={(_event, value) => onField('AuthType_u32', Number(value))}
              aria-label="Authentication method"
            >
              {ALL_AUTH_TYPES.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>
          {authType === VPN.VpnRpcUserAuthType.Password && (
            <FormGroup label={isCreate ? 'Password' : 'New password'} fieldId={`${idPrefix}-password`}>
              <TextInput
                type="password"
                id={`${idPrefix}-password`}
                value={password}
                onChange={(_event, value) => onPassword(value)}
                placeholder={isCreate ? undefined : 'Leave blank to keep the current password'}
                aria-label={isCreate ? 'Password' : 'New password'}
              />
            </FormGroup>
          )}
          {authType === VPN.VpnRpcUserAuthType.UserCert && (
            <FormGroup label="User certificate" fieldId={`${idPrefix}-usercert`}>
              <HelperText>
                <HelperTextItem>
                  The user may connect only with an SSL client certificate that exactly matches the one registered here.
                </HelperTextItem>
              </HelperText>
              <FileUpload
                id={`${idPrefix}-usercert`}
                type="dataURL"
                filename={certFilename}
                filenamePlaceholder="Drag and drop or upload a certificate"
                browseButtonText="Upload"
                hideDefaultPreview
                onFileInputChange={onCertSelected}
                onClearClick={onClearCert}
                dropzoneProps={{ accept: { 'application/x-x509-ca-cert': ['.cer', '.crt', '.cert', '.pem'] } }}
                filenameAriaLabel="Certificate file name"
              />
              {certError && (
                <HelperText>
                  <HelperTextItem variant="error">{certError}</HelperTextItem>
                </HelperText>
              )}
              {certBytes && !certError && (
                <Button
                  variant="link"
                  isInline
                  style={{ marginBlockStart: 'var(--pf-t--global--spacer--sm)' }}
                  onClick={onViewCert}
                >
                  View registered certificate
                </Button>
              )}
            </FormGroup>
          )}
          {authType === VPN.VpnRpcUserAuthType.RootCert && (
            <>
              <FormGroup fieldId={`${idPrefix}-cn-enabled`}>
                <Checkbox
                  id={`${idPrefix}-cn-enabled`}
                  label="Set common name (CN)"
                  isChecked={rootCommonNameEnabled}
                  onChange={(_event, checked) => onRootCommonNameEnabled(checked)}
                />
              </FormGroup>
              <FormGroup label="Common name (CN)" fieldId={`${idPrefix}-cn`}>
                <TextInput
                  id={`${idPrefix}-cn`}
                  value={String(user.CommonName_utf ?? '')}
                  onChange={(_event, value) => onField('CommonName_utf', value)}
                  aria-label="Common name"
                  isDisabled={!rootCommonNameEnabled}
                  validated={rootCommonNameEnabled && String(user.CommonName_utf ?? '').trim().length === 0 ? 'error' : 'default'}
                />
                {rootCommonNameEnabled && String(user.CommonName_utf ?? '').trim().length === 0 && (
                  <HelperText>
                    <HelperTextItem variant="error">Common name is required when enabled.</HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
              <FormGroup fieldId={`${idPrefix}-serial-enabled`}>
                <Checkbox
                  id={`${idPrefix}-serial-enabled`}
                  label="Set serial number"
                  isChecked={rootSerialEnabled}
                  onChange={(_event, checked) => onRootSerialEnabled(checked)}
                />
              </FormGroup>
              <FormGroup label="Serial number" fieldId={`${idPrefix}-serial`}>
                <TextInput
                  id={`${idPrefix}-serial`}
                  value={rootSerial}
                  onChange={(_event, value) => onRootSerial(value)}
                  aria-label="Serial number"
                  isDisabled={!rootSerialEnabled}
                  validated={serialError ? 'error' : 'default'}
                />
                {serialError && (
                  <HelperText>
                    <HelperTextItem variant="error">{serialError}</HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
            </>
          )}
          {authType === VPN.VpnRpcUserAuthType.Radius && (
            <FormGroup label="RADIUS username" fieldId={`${idPrefix}-radius`}>
              <TextInput
                id={`${idPrefix}-radius`}
                value={String(user.RadiusUsername_utf ?? '')}
                onChange={(_event, value) => onField('RadiusUsername_utf', value)}
                aria-label="RADIUS username"
              />
            </FormGroup>
          )}
          {authType === VPN.VpnRpcUserAuthType.NTDomain && (
            <FormGroup label="NT domain username" fieldId={`${idPrefix}-nt`}>
              <TextInput
                id={`${idPrefix}-nt`}
                value={String(user.NtUsername_utf ?? '')}
                onChange={(_event, value) => onField('NtUsername_utf', value)}
                aria-label="NT domain username"
              />
            </FormGroup>
          )}
          <FormGroup label="Security policy" fieldId={`${idPrefix}-policy`}>
            <Button variant="secondary" onClick={onPolicy}>
              {user.UsePolicy_bool ? 'Edit security policy' : 'Add security policy'}
            </Button>
          </FormGroup>
          <FormGroup fieldId={`${idPrefix}-expires`}>
            <Checkbox
              id={`${idPrefix}-expires`}
              label="Account expires"
              isChecked={!isNeverDate(user.ExpireTime_dt)}
              onChange={(_event, checked) =>
                onField('ExpireTime_dt', checked ? new Date(Date.now() + 365 * 864e5).toISOString() : NEVER)
              }
            />
          </FormGroup>
          {!isNeverDate(user.ExpireTime_dt) && (
            <FormGroup label="Expiration date" fieldId={`${idPrefix}-expiredate`}>
              <TextInput
                type="date"
                id={`${idPrefix}-expiredate`}
                value={toDateInput(user.ExpireTime_dt)}
                onChange={(_event, value) =>
                  onField('ExpireTime_dt', value ? new Date(`${value}T00:00:00Z`).toISOString() : NEVER)
                }
                aria-label="Expiration date"
              />
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onSubmit} isDisabled={isSubmitDisabled}>
          {isCreate ? 'Create' : 'Save'}
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

const Users: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [users, setUsers] = React.useState<VPN.VpnRpcEnumUserItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [create, setCreate] = React.useState<Record<string, unknown> | null>(null);
  const [createPassword, setCreatePassword] = React.useState('');
  const [createCertFilename, setCreateCertFilename] = React.useState('');
  const [createCertError, setCreateCertError] = React.useState<string | null>(null);
  const [createRootCommonNameEnabled, setCreateRootCommonNameEnabled] = React.useState(false);
  const [createRootSerialEnabled, setCreateRootSerialEnabled] = React.useState(false);
  const [createRootSerial, setCreateRootSerial] = React.useState('');

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  // Working copy of the user being edited (the full GetUser response) plus an
  // optional new password (blank = keep the current one).
  const [edit, setEdit] = React.useState<Record<string, unknown> | null>(null);
  const [editOriginal, setEditOriginal] = React.useState<Record<string, unknown> | null>(null);
  const [newPassword, setNewPassword] = React.useState('');
  const [editCertFilename, setEditCertFilename] = React.useState('');
  const [editCertError, setEditCertError] = React.useState<string | null>(null);
  const [editRootCommonNameEnabled, setEditRootCommonNameEnabled] = React.useState(false);
  const [editRootSerialEnabled, setEditRootSerialEnabled] = React.useState(false);
  const [editRootSerial, setEditRootSerial] = React.useState('');
  const [certOpen, setCertOpen] = React.useState<'create' | 'edit' | null>(null);
  const [policyOpen, setPolicyOpen] = React.useState<'create' | 'edit' | null>(null);

  const load = React.useCallback(() => {
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
    setCreate(emptyUserDraft());
    setCreatePassword('');
    setCreateCertFilename('');
    setCreateCertError(null);
    setCreateRootCommonNameEnabled(false);
    setCreateRootSerialEnabled(false);
    setCreateRootSerial('');
  };

  const canCreate =
    !!create &&
    String(create.Name_str ?? '').trim().length > 0 &&
    userAuthValid(create, createCertError, createRootCommonNameEnabled, createRootSerialEnabled, createRootSerial);

  const createUser = () => {
    if (!create) {
      return;
    }
    const authType = Number(create.AuthType_u32) || 0;
    const obj = new VPN.VpnRpcSetUser({
      ...create,
      HubName_str: hub,
      Name_str: String(create.Name_str ?? '').trim(),
      Auth_Password_str: authType === VPN.VpnRpcUserAuthType.Password ? createPassword : '',
      UserX_bin: authType === VPN.VpnRpcUserAuthType.UserCert ? binToBytes(create.UserX_bin) ?? new Uint8Array() : new Uint8Array(),
      CommonName_utf:
        authType === VPN.VpnRpcUserAuthType.RootCert && createRootCommonNameEnabled ? String(create.CommonName_utf ?? '').trim() : '',
      Serial_bin:
        authType === VPN.VpnRpcUserAuthType.RootCert && createRootSerialEnabled ? parseSerial(createRootSerial).bytes : new Uint8Array(),
      RadiusUsername_utf: authType === VPN.VpnRpcUserAuthType.Radius ? String(create.RadiusUsername_utf ?? '') : '',
      NtUsername_utf: authType === VPN.VpnRpcUserAuthType.NTDomain ? String(create.NtUsername_utf ?? '') : '',
      ExpireTime_dt: new Date(String(create.ExpireTime_dt ?? NEVER)),
    });
    api
      .CreateUser(obj)
      .then(() => {
        setCreate(null);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setCreate(null);
      });
  };

  const openEdit = (userName: string) => {
    setNewPassword('');
    setEditCertFilename('');
    setEditCertError(null);
    setEditRootCommonNameEnabled(false);
    setEditRootSerialEnabled(false);
    setEditRootSerial('');
    api
      .GetUser(new VPN.VpnRpcSetUser({ HubName_str: hub, Name_str: userName }))
      .then((response) => {
        const record = response as unknown as Record<string, unknown>;
        setEdit(record);
        setEditOriginal(record);
        setEditRootCommonNameEnabled(String(record.CommonName_utf ?? '').trim().length > 0);
        setEditRootSerialEnabled(binToBytes(record.Serial_bin) !== null);
        setEditRootSerial(hexFromBytes(record.Serial_bin));
      })
      .catch((e) => setError(String(e)));
  };

  const setCreateField = (key: string, value: unknown) => setCreate((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setEditField = (key: string, value: unknown) => setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setCreateAuthType = (value: unknown) => {
    if (Number(value) === VPN.VpnRpcUserAuthType.RootCert && Number(create?.AuthType_u32) !== VPN.VpnRpcUserAuthType.RootCert) {
      setCreateRootCommonNameEnabled(false);
      setCreateRootSerialEnabled(false);
      setCreateRootSerial('');
      setCreate((prev) => (prev ? { ...prev, AuthType_u32: value, CommonName_utf: '', Serial_bin: new Uint8Array() } : prev));
      return;
    }
    setCreateField('AuthType_u32', value);
  };
  const setEditAuthType = (value: unknown) => {
    if (Number(value) === VPN.VpnRpcUserAuthType.RootCert && Number(edit?.AuthType_u32) !== VPN.VpnRpcUserAuthType.RootCert) {
      setEditRootCommonNameEnabled(false);
      setEditRootSerialEnabled(false);
      setEditRootSerial('');
      setEdit((prev) => (prev ? { ...prev, AuthType_u32: value, CommonName_utf: '', Serial_bin: new Uint8Array() } : prev));
      return;
    }
    setEditField('AuthType_u32', value);
  };
  const setCreateRootSerialField = (value: string) => {
    setCreateRootSerial(value);
    const result = parseSerial(value);
    if (result.error === null) {
      setCreateField('Serial_bin', result.bytes);
    }
  };
  const setEditRootSerialField = (value: string) => {
    setEditRootSerial(value);
    const result = parseSerial(value);
    if (result.error === null) {
      setEditField('Serial_bin', result.bytes);
    }
  };
  const toggleCreateRootCommonName = (enabled: boolean) => {
    setCreateRootCommonNameEnabled(enabled);
    if (!enabled) {
      setCreateField('CommonName_utf', '');
    }
  };
  const toggleEditRootCommonName = (enabled: boolean) => {
    setEditRootCommonNameEnabled(enabled);
    if (!enabled) {
      setEditField('CommonName_utf', '');
    }
  };
  const toggleCreateRootSerial = (enabled: boolean) => {
    setCreateRootSerialEnabled(enabled);
    if (!enabled) {
      setCreateRootSerial('');
      setCreateField('Serial_bin', new Uint8Array());
    }
  };
  const toggleEditRootSerial = (enabled: boolean) => {
    setEditRootSerialEnabled(enabled);
    if (!enabled) {
      setEditRootSerial('');
      setEditField('Serial_bin', new Uint8Array());
    }
  };

  const readUserCertificate = (
    file: File,
    setFilename: (value: string) => void,
    setFieldError: (value: string | null) => void,
    setBytes: (value: Uint8Array) => void,
  ) => {
    setFieldError(null);
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        parseCertificate(bytes); // throws if not a certificate
        setBytes(bytes);
      } catch {
        setFieldError('The file is not a valid certificate (PEM or DER).');
        setBytes(new Uint8Array());
      }
    };
    reader.onerror = () => setFieldError('The certificate file could not be read.');
    reader.readAsArrayBuffer(file);
  };

  const onCreateCertSelected = (_event: unknown, file: File) =>
    readUserCertificate(file, setCreateCertFilename, setCreateCertError, (bytes) => setCreateField('UserX_bin', bytes));

  // Read an uploaded certificate file, validate it parses, and stage its bytes
  // as the user's UserX_bin (the server accepts DER or PEM).
  const onEditCertSelected = (_event: unknown, file: File) =>
    readUserCertificate(file, setEditCertFilename, setEditCertError, (bytes) => setEditField('UserX_bin', bytes));

  const clearCreateCert = () => {
    setCreateCertFilename('');
    setCreateCertError(null);
    setCreateField('UserX_bin', new Uint8Array());
  };

  const clearEditCert = () => {
    setEditCertFilename('');
    setEditCertError(null);
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
    obj.HubName_str = hub; // ensure the save targets this hub even if GetUser omits it
    if (Number(obj.AuthType_u32) === VPN.VpnRpcUserAuthType.Password && newPassword) {
      obj.Auth_Password_str = newPassword;
    } else {
      delete (obj as { Auth_Password_str?: string }).Auth_Password_str;
    }
    // UserX_bin arrives from GetUser as a base64 string; the client base64-
    // encodes _bin fields on send, so hand it real bytes to avoid double
    // encoding (and drop it entirely when there is no certificate to keep).
    const certBin = binToBytes(edit.UserX_bin);
    if (Number(obj.AuthType_u32) === VPN.VpnRpcUserAuthType.UserCert && certBin) {
      obj.UserX_bin = certBin;
    } else {
      delete (obj as { UserX_bin?: Uint8Array }).UserX_bin;
    }
    if (Number(obj.AuthType_u32) === VPN.VpnRpcUserAuthType.RootCert) {
      obj.CommonName_utf = editRootCommonNameEnabled ? String(edit.CommonName_utf ?? '').trim() : '';
      obj.Serial_bin = editRootSerialEnabled ? parseSerial(editRootSerial).bytes : new Uint8Array();
    } else {
      delete (obj as { CommonName_utf?: string }).CommonName_utf;
      delete (obj as { Serial_bin?: Uint8Array }).Serial_bin;
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
  const editDirty = recordChanged(editOriginal, edit, newPassword.length > 0);
  const editValid =
    !edit || userAuthValid(edit, editCertError, editRootCommonNameEnabled, editRootSerialEnabled, editRootSerial);

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapSm' }}>
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

      {create && (
        <UserSettingsModal
          mode="create"
          user={create}
          password={createPassword}
          certFilename={createCertFilename}
          certError={createCertError}
          rootCommonNameEnabled={createRootCommonNameEnabled}
          rootSerialEnabled={createRootSerialEnabled}
          rootSerial={createRootSerial}
          isOpen={certOpen === null && policyOpen === null}
          isSubmitDisabled={!canCreate}
          onClose={() => setCreate(null)}
          onSubmit={createUser}
          onField={(key, value) => (key === 'AuthType_u32' ? setCreateAuthType(value) : setCreateField(key, value))}
          onPassword={setCreatePassword}
          onCertSelected={onCreateCertSelected}
          onClearCert={clearCreateCert}
          onViewCert={() => setCertOpen('create')}
          onRootCommonNameEnabled={toggleCreateRootCommonName}
          onRootSerialEnabled={toggleCreateRootSerial}
          onRootSerial={setCreateRootSerialField}
          onPolicy={() => setPolicyOpen('create')}
        />
      )}

      {edit && (
        <UserSettingsModal
          mode="edit"
          user={edit}
          password={newPassword}
          certFilename={editCertFilename}
          certError={editCertError}
          rootCommonNameEnabled={editRootCommonNameEnabled}
          rootSerialEnabled={editRootSerialEnabled}
          rootSerial={editRootSerial}
          isOpen={certOpen === null && policyOpen === null}
          isSubmitDisabled={!editDirty || !editValid}
          onClose={() => setEdit(null)}
          onSubmit={saveEdit}
          onField={(key, value) => (key === 'AuthType_u32' ? setEditAuthType(value) : setEditField(key, value))}
          onPassword={setNewPassword}
          onCertSelected={onEditCertSelected}
          onClearCert={clearEditCert}
          onViewCert={() => setCertOpen('edit')}
          onRootCommonNameEnabled={toggleEditRootCommonName}
          onRootSerialEnabled={toggleEditRootSerial}
          onRootSerial={setEditRootSerialField}
          onPolicy={() => setPolicyOpen('edit')}
        />
      )}

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
        certBin={
          certOpen === 'create'
            ? (create?.UserX_bin as Uint8Array | string | undefined) ?? null
            : (edit?.UserX_bin as Uint8Array | string | undefined) ?? null
        }
        isOpen={certOpen !== null}
        onClose={() => setCertOpen(null)}
      />

      <SecurityPolicyModal
        title={
          policyOpen === 'create'
            ? `Security policy: ${String(create?.Name_str ?? '').trim() || 'New user'}`
            : edit
              ? `Security policy: ${String(edit.Name_str ?? '')}`
              : 'Security policy'
        }
        subject={policyOpen === 'create' ? create : edit}
        isOpen={policyOpen !== null}
        onClose={() => setPolicyOpen(null)}
        onSave={(updated) => {
          if (policyOpen === 'create') {
            setCreate(updated);
          } else {
            setEdit(updated);
          }
          setPolicyOpen(null);
        }}
      />
    </Flex>
  );
};

export { Users };
