import * as React from 'react';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ScrollableTable } from '@app/components/ScrollableTable';
import { useNavigate } from 'react-router-dom';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';

const EtherIPDetailed: React.FunctionComponent = () => {
  const navigate = useNavigate();

  const [settings, setSettings] = React.useState<VPN.VpnEtherIpId[] | null>(null);
  const [hubs, setHubs] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [id, setId] = React.useState('');
  const [hub, setHub] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    Promise.all([api.EnumEtherIpId(), api.EnumHub()])
      .then(([list, hubList]) => {
        setSettings(list.Settings ?? []);
        setHubs((hubList.HubList ?? []).map((h) => h.HubName_str));
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const run = (promise: Promise<unknown>) => {
    setBusy(true);
    setError(null);
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

  const openCreate = () => {
    setId('');
    setHub(hubs[0] ?? '');
    setUsername('');
    setPassword('');
    setCreateOpen(true);
  };

  const create = () => {
    setCreateOpen(false);
    run(
      api.AddEtherIpId(
        new VPN.VpnEtherIpId({
          Id_str: id.trim(),
          HubName_str: hub,
          UserName_str: username,
          Password_str: password,
        }),
      ),
    );
  };

  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target === null) {
      return;
    }
    run(api.DeleteEtherIpId(new VPN.VpnEtherIpId({ Id_str: target })));
  };

  const isLoading = settings === null && error === null;

  const createButton = (
    <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate} isDisabled={isLoading || hubs.length === 0}>
      Add client setting
    </Button>
  );

  const canCreate = id.trim() !== '' && hub !== '' && username.trim() !== '';

  return (
    <>
      <Breadcrumb style={{ padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg) 0' }}>
        <BreadcrumbItem to="#" onClick={() => navigate('/functionalities/legacyprotocols')}>
          Legacy Protocols
        </BreadcrumbItem>
        <BreadcrumbItem isActive>EtherIP / L2TPv3</BreadcrumbItem>
      </Breadcrumb>
      <AppPage
        title="EtherIP / L2TPv3 detailed settings"
        description="Map each client router's IPsec Phase 1 ID to a Virtual Hub and login, so EtherIP / L2TPv3 routers can bridge in."
        actions={createButton}
      >
        <Stack hasGutter>
          {error && (
            <StackItem>
              <Alert variant="danger" title="EtherIP operation failed" isInline>
                {error}
              </Alert>
            </StackItem>
          )}

          <StackItem isFilled>
            {isLoading ? (
              <Bullseye>
                <Spinner size="xl" aria-label="Loading EtherIP settings" />
              </Bullseye>
            ) : settings !== null && settings.length === 0 ? (
              <EmptyState titleText="No client settings" headingLevel="h2">
                <EmptyStateBody>Add a client setting for each EtherIP / L2TPv3 router that connects.</EmptyStateBody>
              </EmptyState>
            ) : settings !== null ? (
              <ScrollableTable aria-label="EtherIP client settings" variant="compact">
                <Thead>
                  <Tr>
                    <Th>ISAKMP Phase 1 ID</Th>
                    <Th>Virtual Hub</Th>
                    <Th>User name</Th>
                    <Th screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {settings.map((setting) => (
                    <Tr key={setting.Id_str}>
                      <Td dataLabel="ISAKMP Phase 1 ID">{setting.Id_str}</Td>
                      <Td dataLabel="Virtual Hub">{setting.HubName_str}</Td>
                      <Td dataLabel="User name">{setting.UserName_str}</Td>
                      <Td isActionCell>
                        <ActionsColumn
                          items={[{ title: 'Delete', onClick: () => setPendingDelete(setting.Id_str) }]}
                          isDisabled={busy}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </ScrollableTable>
            ) : null}
          </StackItem>
        </Stack>

        {/* Add client setting */}
        <Modal variant={ModalVariant.small} isOpen={createOpen} onClose={() => setCreateOpen(false)}>
          <ModalHeader title="Add EtherIP / L2TPv3 client setting" />
          <ModalBody>
            <Form>
              <FormGroup label="ISAKMP Phase 1 ID" fieldId="etherip-id">
                <TextInput id="etherip-id" value={id} onChange={(_event, value) => setId(value)} aria-label="ISAKMP Phase 1 ID" />
              </FormGroup>
              <FormGroup label="Virtual Hub" fieldId="etherip-hub">
                <FormSelect id="etherip-hub" value={hub} onChange={(_event, value) => setHub(value)} aria-label="Virtual Hub">
                  {hubs.map((h) => (
                    <FormSelectOption key={h} value={h} label={h} />
                  ))}
                </FormSelect>
              </FormGroup>
              <FormGroup label="User name" fieldId="etherip-user">
                <TextInput
                  id="etherip-user"
                  value={username}
                  onChange={(_event, value) => setUsername(value)}
                  aria-label="User name"
                />
              </FormGroup>
              <FormGroup label="Password" fieldId="etherip-pass">
                <TextInput
                  type="password"
                  id="etherip-pass"
                  value={password}
                  onChange={(_event, value) => setPassword(value)}
                  aria-label="Password"
                />
              </FormGroup>
            </Form>
            <Content component="small">The user name and password identify the client to the Virtual Hub.</Content>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={create} isDisabled={!canCreate}>
              Add
            </Button>
            <Button variant="link" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>

        {/* Delete confirmation */}
        <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
          <ModalHeader title="Delete client setting" titleIconVariant="warning" />
          <ModalBody>
            Delete the EtherIP / L2TPv3 client setting <strong>{pendingDelete}</strong>?
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
    </>
  );
};

export { EtherIPDetailed };
