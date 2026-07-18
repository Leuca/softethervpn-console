import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  NumberInput,
  Spinner,
} from '@patternfly/react-core';
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ScrollableTable } from '@app/components/ScrollableTable';
import { PlusCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { FormErrorAlert } from '@app/components/FormErrorAlert';

const MIN_PORT = 1;
const MAX_PORT = 65535;

type StatusColor = 'green' | 'grey' | 'red';

function listenerStatus(listener: VPN.VpnRpcListenerListItem): { label: string; color: StatusColor } {
  if (listener.Errors_bool) {
    return { label: 'Error', color: 'red' };
  }
  if (!listener.Enables_bool) {
    return { label: 'Stopped', color: 'grey' };
  }
  return { label: 'Listening', color: 'green' };
}

const Listeners: React.FunctionComponent = () => {
  const [listeners, setListeners] = React.useState<VPN.VpnRpcListenerListItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newPort, setNewPort] = React.useState(MIN_PORT);

  const [pendingDelete, setPendingDelete] = React.useState<number | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    api
      .EnumListener()
      .then((response) => setListeners(response.ListenerList ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const usedPorts = React.useMemo(() => new Set((listeners ?? []).map((l) => l.Ports_u32)), [listeners]);

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

  const openCreate = () => {
    // Default to the next free port after the highest one in use.
    const highest = (listeners ?? []).reduce((max, l) => Math.max(max, l.Ports_u32), 0);
    setNewPort(Math.min(Math.max(highest + 1, MIN_PORT), MAX_PORT));
    setError(null);
    setCreateOpen(true);
  };

  const clampPort = (value: number) => Math.min(Math.max(value, MIN_PORT), MAX_PORT);

  const create = () => {
    setBusy(true);
    setError(null);
    api
      .CreateListener(new VPN.VpnRpcListener({ Port_u32: newPort, Enable_bool: true }))
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

  const setEnabled = (port: number, enable: boolean) =>
    run(api.EnableListener(new VPN.VpnRpcListener({ Port_u32: port, Enable_bool: enable })));

  const confirmDelete = () => {
    if (pendingDelete === null) {
      return;
    }
    const port = pendingDelete;
    setPendingDelete(null);
    run(api.DeleteListener(new VPN.VpnRpcListener({ Port_u32: port })));
  };

  const isLoading = listeners === null && error === null;

  const createButton = (
    <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate} isDisabled={isLoading}>
      Create listener
    </Button>
  );

  return (
    <AppPage
      title="Listeners"
      description="TCP ports the VPN server accepts client connections on. You can create, delete, start and stop listeners."
      actions={createButton}
    >
      {error && !createOpen && (
        <Alert
          variant="danger"
          title="Listener operation failed"
          isInline
          style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
        >
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading listeners" />
        </Bullseye>
      ) : listeners !== null && listeners.length === 0 ? (
        <EmptyState titleText="No listeners defined" headingLevel="h2">
          <EmptyStateBody>The server is not listening on any TCP port.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate}>
                Create listener
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : listeners !== null ? (
        <ScrollableTable aria-label="Listeners" variant="compact">
          <Thead>
            <Tr>
              <Th>Port</Th>
              <Th>Status</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {listeners.map((listener) => {
              const status = listenerStatus(listener);
              return (
                <Tr key={listener.Ports_u32}>
                  <Td dataLabel="Port">TCP {listener.Ports_u32}</Td>
                  <Td dataLabel="Status">
                    <Label color={status.color} isCompact>
                      {status.label}
                    </Label>
                  </Td>
                  <Td isActionCell>
                    <ActionsColumn
                      items={[
                        listener.Enables_bool
                          ? { title: 'Stop', onClick: () => setEnabled(listener.Ports_u32, false) }
                          : { title: 'Start', onClick: () => setEnabled(listener.Ports_u32, true) },
                        { isSeparator: true },
                        { title: 'Delete', onClick: () => setPendingDelete(listener.Ports_u32) },
                      ]}
                      isDisabled={busy}
                    />
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </ScrollableTable>
      ) : null}

      {/* Create listener */}
      <Modal
        variant={ModalVariant.small}
        isOpen={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
      >
        <ModalHeader title="Create listener" />
        <ModalBody>
          <FormErrorAlert error={error} title="Listener operation failed" />
          <Content component="p">Add a TCP/IP port number for the VPN server to accept client connections on.</Content>
          <Form>
            <FormGroup label="Port number" fieldId="listener-port">
              <NumberInput
                id="listener-port"
                value={newPort}
                min={MIN_PORT}
                max={MAX_PORT}
                onMinus={() => setNewPort((p) => clampPort(p - 1))}
                onPlus={() => setNewPort((p) => clampPort(p + 1))}
                onChange={(event) => {
                  const value = Number((event.target as HTMLInputElement).value);
                  setNewPort(Number.isNaN(value) ? MIN_PORT : clampPort(value));
                }}
                inputName="listener-port"
                inputAriaLabel="Port number"
                minusBtnAriaLabel="Decrease port"
                plusBtnAriaLabel="Increase port"
              />
            </FormGroup>
          </Form>
          {usedPorts.has(newPort) && (
            <Alert
              variant="warning"
              title="Port already in use"
              isInline
              style={{ marginBlockStart: 'var(--pf-t--global--spacer--md)' }}
            >
              A listener on port {newPort} already exists.
            </Alert>
          )}
          <Alert
            variant="info"
            title="Only one program can bind a port"
            isInline
            style={{ marginBlockStart: 'var(--pf-t--global--spacer--md)' }}
          >
            If another program is already using this port, the listener will show an error state until that program
            releases it.
          </Alert>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={create}
            isDisabled={usedPorts.has(newPort) || busy}
            isLoading={busy}
          >
            Create
          </Button>
          <Button variant="link" onClick={() => setCreateOpen(false)} isDisabled={busy}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete confirmation */}
      <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader title="Delete listener" titleIconVariant="warning" />
        <ModalBody>
          Delete the listener on <strong>TCP port {pendingDelete}</strong>? The server will stop accepting connections
          on this port.
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

export { Listeners };
