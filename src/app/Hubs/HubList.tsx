import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ScrollableTable } from '@app/components/ScrollableTable';
import { PlusCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { useServer } from '@app/ServerContext';
import { AppPage } from '@app/components/AppPage';
import { FormErrorAlert } from '@app/components/FormErrorAlert';
import { formatRpcValue, hubTypeLabel } from '@app/utils/format';

const HubList: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const { hideAdminOnly, info } = useServer();

  const [hubs, setHubs] = React.useState<VPN.VpnRpcEnumHubItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    api
      .EnumHub()
      .then((response) => setHubs(response.HubList ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const run = (promise: Promise<unknown>) => {
    setBusy(true);
    promise
      .then(() => {
        setBusy(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
  };

  const setOnline = (hubName: string, online: boolean) =>
    run(api.SetHubOnline(new VPN.VpnRpcSetHubOnline({ HubName_str: hubName, Online_bool: online })));

  const openCreate = () => {
    if (hideAdminOnly) {
      return;
    }
    setName('');
    setPassword('');
    setConfirm('');
    setError(null);
    setCreateOpen(true);
  };

  const passwordsMatch = password === confirm;
  const canCreate = !hideAdminOnly && name.trim().length > 0 && passwordsMatch;

  const create = () => {
    if (hideAdminOnly) {
      return;
    }
    // A standalone server (ServerType 0) only has standalone hubs; on a cluster
    // controller new hubs default to static.
    const isCluster = Number(info['ServerType_u32'] ?? 0) !== 0;
    setBusy(true);
    setError(null);
    api
      .CreateHub(
        new VPN.VpnRpcCreateHub({
          HubName_str: name.trim(),
          AdminPasswordPlainText_str: password,
          Online_bool: true,
          MaxSession_u32: 0,
          HubType_u32: isCluster ? VPN.VpnRpcHubType.FarmStatic : VPN.VpnRpcHubType.Standalone,
        }),
      )
      .then(() => {
        setBusy(false);
        setCreateOpen(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
  };

  const confirmDelete = () => {
    if (hideAdminOnly) {
      setPendingDelete(null);
      return;
    }
    if (pendingDelete === null) {
      return;
    }
    const hubName = pendingDelete;
    setPendingDelete(null);
    run(api.DeleteHub(new VPN.VpnRpcDeleteHub({ HubName_str: hubName })));
  };

  const isLoading = hubs === null && error === null;

  const createButton = hideAdminOnly ? null : (
    <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate} isDisabled={isLoading}>
      Create Virtual Hub
    </Button>
  );

  return (
    <AppPage
      title="Virtual Hubs"
      description="Each Virtual Hub is an isolated virtual Ethernet switch with its own users, groups and security policy."
      actions={createButton}
    >
      {error && !createOpen && (
        <Alert
          variant="danger"
          title="Hub operation failed"
          isInline
          style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
        >
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading hubs" />
        </Bullseye>
      ) : hubs !== null && hubs.length === 0 ? (
        <EmptyState titleText="No Virtual Hubs" headingLevel="h2">
          <EmptyStateBody>
            {hideAdminOnly
              ? 'No Virtual Hubs are visible for this administrator account.'
              : 'Create a Virtual Hub to start accepting VPN connections.'}
          </EmptyStateBody>
          {!hideAdminOnly && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate}>
                  Create Virtual Hub
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      ) : hubs !== null ? (
        <ScrollableTable aria-label="Virtual Hubs" variant="compact">
          <Thead>
            <Tr>
              <Th>Virtual Hub</Th>
              <Th>Status</Th>
              <Th>Type</Th>
              <Th>Users</Th>
              <Th>Groups</Th>
              <Th>Sessions</Th>
              <Th>Last login</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {hubs.map((hub) => (
              <Tr key={hub.HubName_str}>
                <Td dataLabel="Virtual Hub">
                  <Button
                    variant="link"
                    isInline
                    onClick={() => navigate(`/hubs/${encodeURIComponent(hub.HubName_str)}`)}
                  >
                    {hub.HubName_str}
                  </Button>
                </Td>
                <Td dataLabel="Status">
                  <Switch
                    id={`hub-online-${hub.HubName_str}`}
                    aria-label={`${hub.HubName_str} online`}
                    label="Online"
                    isChecked={hub.Online_bool}
                    isDisabled={busy}
                    onChange={(_event, checked) => setOnline(hub.HubName_str, checked)}
                  />
                </Td>
                <Td dataLabel="Type">{hubTypeLabel(hub.HubType_u32)}</Td>
                <Td dataLabel="Users">{hub.NumUsers_u32.toLocaleString()}</Td>
                <Td dataLabel="Groups">{hub.NumGroups_u32.toLocaleString()}</Td>
                <Td dataLabel="Sessions">{hub.NumSessions_u32.toLocaleString()}</Td>
                <Td dataLabel="Last login">{formatRpcValue('LastLoginTime_dt', hub.LastLoginTime_dt)}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={
                      hideAdminOnly
                        ? [{ title: 'Manage', onClick: () => navigate(`/hubs/${encodeURIComponent(hub.HubName_str)}`) }]
                        : [
                            { title: 'Manage', onClick: () => navigate(`/hubs/${encodeURIComponent(hub.HubName_str)}`) },
                            { isSeparator: true },
                            { title: 'Delete', onClick: () => setPendingDelete(hub.HubName_str) },
                          ]
                    }
                    isDisabled={busy}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </ScrollableTable>
      ) : null}

      {/* Create hub */}
      <Modal
        variant={ModalVariant.small}
        isOpen={!hideAdminOnly && createOpen}
        onClose={() => !busy && setCreateOpen(false)}
      >
        <ModalHeader title="Create Virtual Hub" />
        <ModalBody>
          <FormErrorAlert error={error} title="Hub operation failed" />
          <Form>
            <FormGroup label="Virtual Hub name" isRequired fieldId="hub-name">
              <TextInput
                isRequired
                id="hub-name"
                value={name}
                onChange={(_event, value) => setName(value)}
                aria-label="Virtual Hub name"
              />
            </FormGroup>
            <FormGroup label="Administrator password" fieldId="hub-password">
              <TextInput
                type="password"
                id="hub-password"
                value={password}
                onChange={(_event, value) => setPassword(value)}
                aria-label="Administrator password"
              />
            </FormGroup>
            <FormGroup label="Confirm password" fieldId="hub-confirm">
              <TextInput
                type="password"
                id="hub-confirm"
                value={confirm}
                onChange={(_event, value) => setConfirm(value)}
                validated={passwordsMatch ? 'default' : 'error'}
                aria-label="Confirm password"
              />
              {!passwordsMatch && (
                <HelperText>
                  <HelperTextItem variant="error">Passwords do not match.</HelperTextItem>
                </HelperText>
              )}
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={create} isDisabled={!canCreate || busy} isLoading={busy}>
            Create
          </Button>
          <Button variant="link" onClick={() => setCreateOpen(false)} isDisabled={busy}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete confirmation */}
      <Modal variant={ModalVariant.small} isOpen={!hideAdminOnly && pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader title="Delete Virtual Hub" titleIconVariant="warning" />
        <ModalBody>
          Delete <strong>{pendingDelete}</strong>? All sessions are terminated and every user, group, certificate and
          cascade connection in this hub is permanently removed. This cannot be undone.
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
    </AppPage>
  );
};

export { HubList };
