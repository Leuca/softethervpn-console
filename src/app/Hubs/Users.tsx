import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
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
import { formatOptionalDate, userAuthTypeLabel } from '@app/utils/format';

// Auth types offered when creating a user. The others (certificate, RADIUS, NT)
// need extra server configuration and are left to the (upcoming) edit view.
const CREATABLE_AUTH_TYPES = [
  { value: VPN.VpnRpcUserAuthType.Anonymous, label: 'Anonymous' },
  { value: VPN.VpnRpcUserAuthType.Password, label: 'Password' },
];

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
                  <ActionsColumn items={[{ title: 'Delete', onClick: () => setPendingDelete(user.Name_str) }]} />
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
    </Flex>
  );
};

export { Users };
