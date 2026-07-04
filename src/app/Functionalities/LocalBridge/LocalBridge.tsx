import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Radio,
  Spinner,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { PlusCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { useServer } from '@app/ServerContext';
import { AppPage } from '@app/components/AppPage';

// Tap device names are limited to 11 characters by SoftEther.
const MAX_TAP_NAME = 11;

type BridgeMode = 'adapter' | 'tap';

type StatusColor = 'green' | 'red';

function bridgeStatus(bridge: VPN.VpnRpcLocalBridge): { label: string; color: StatusColor } {
  if (bridge.Online_bool && bridge.Active_bool) {
    return { label: 'Operational', color: 'green' };
  }
  return { label: 'Error', color: 'red' };
}

const LocalBridge: React.FunctionComponent = () => {
  const { isTapSupported } = useServer();

  const [bridges, setBridges] = React.useState<VPN.VpnRpcLocalBridge[] | null>(null);
  const [hubs, setHubs] = React.useState<string[]>([]);
  const [adapters, setAdapters] = React.useState<VPN.VpnRpcEnumEthItem[]>([]);
  const [bridgeSupported, setBridgeSupported] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [mode, setMode] = React.useState<BridgeMode>('adapter');
  const [newHub, setNewHub] = React.useState('');
  const [newAdapter, setNewAdapter] = React.useState('');
  const [tapName, setTapName] = React.useState('');

  const [pendingDelete, setPendingDelete] = React.useState<VPN.VpnRpcLocalBridge | null>(null);

  const load = React.useCallback(() => {
    setBridges(null);
    setError(null);
    Promise.all([api.GetBridgeSupport(), api.EnumLocalBridge(), api.EnumHub(), api.EnumEthernet()])
      .then(([support, bridgeList, hubList, ethList]) => {
        setBridgeSupported(support.IsBridgeSupportedOs_bool);
        setBridges(bridgeList.LocalBridgeList ?? []);
        setHubs((hubList.HubList ?? []).map((hub) => hub.HubName_str));
        setAdapters(ethList.EthList ?? []);
      })
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

  const openCreate = () => {
    setMode(isTapSupported ? mode : 'adapter');
    setNewHub(hubs[0] ?? '');
    setNewAdapter(adapters[0]?.DeviceName_str ?? '');
    setTapName('');
    setCreateOpen(true);
  };

  const create = () => {
    const deviceName = mode === 'tap' ? tapName : newAdapter;
    setCreateOpen(false);
    run(
      api.AddLocalBridge(
        new VPN.VpnRpcLocalBridge({
          DeviceName_str: deviceName,
          HubNameLB_str: newHub,
          TapMode_bool: mode === 'tap',
        }),
      ),
    );
  };

  const confirmDelete = () => {
    if (pendingDelete === null) {
      return;
    }
    const target = pendingDelete;
    setPendingDelete(null);
    run(
      api.DeleteLocalBridge(
        new VPN.VpnRpcLocalBridge({
          DeviceName_str: target.DeviceName_str,
          HubNameLB_str: target.HubNameLB_str,
        }),
      ),
    );
  };

  const isLoading = bridges === null && error === null;

  // A bridge needs a hub plus either an adapter or a non-empty tap name.
  const canCreate =
    newHub !== '' && (mode === 'tap' ? tapName.trim() !== '' : newAdapter !== '') && bridgeSupported;

  const createButton = (
    <Button
      variant="primary"
      icon={<PlusCircleIcon />}
      onClick={openCreate}
      isDisabled={isLoading || !bridgeSupported || hubs.length === 0}
    >
      Create local bridge
    </Button>
  );

  return (
    <AppPage
      title="Local Bridge"
      description="Bridge a Virtual Hub to a physical Ethernet adapter (or a tap device on Linux) at Layer 2."
      actions={createButton}
    >
      <Stack hasGutter>
        {error && (
          <StackItem>
            <Alert variant="danger" title="Local bridge operation failed" isInline>
              {error}
            </Alert>
          </StackItem>
        )}

        {!isLoading && !bridgeSupported && (
          <StackItem>
            <Alert variant="warning" title="Local Bridge is not supported on this operating system" isInline>
              This VPN server cannot create local bridges.
            </Alert>
          </StackItem>
        )}

        <StackItem isFilled>
          {isLoading ? (
            <Bullseye>
              <Spinner size="xl" aria-label="Loading local bridges" />
            </Bullseye>
          ) : bridges !== null && bridges.length === 0 ? (
            <EmptyState titleText="No local bridge defined" headingLevel="h2">
              <EmptyStateBody>
                A local bridge connects a Virtual Hub to a physical network. Use Create local bridge to add one.
              </EmptyStateBody>
            </EmptyState>
          ) : bridges !== null ? (
            <Table aria-label="Local bridges" variant="compact">
              <Thead>
                <Tr>
                  <Th>#</Th>
                  <Th>Type</Th>
                  <Th>Virtual Hub</Th>
                  <Th>Network adapter or tap device</Th>
                  <Th>Status</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {bridges.map((bridge, index) => {
                  const status = bridgeStatus(bridge);
                  return (
                    <Tr key={`${bridge.HubNameLB_str}/${bridge.DeviceName_str}`}>
                      <Td dataLabel="#">{index + 1}</Td>
                      <Td dataLabel="Type">{bridge.TapMode_bool ? 'Tap device' : 'Network adapter'}</Td>
                      <Td dataLabel="Virtual Hub">{bridge.HubNameLB_str}</Td>
                      <Td dataLabel="Network adapter or tap device">{bridge.DeviceName_str}</Td>
                      <Td dataLabel="Status">
                        <Label color={status.color} isCompact>
                          {status.label}
                        </Label>
                      </Td>
                      <Td isActionCell>
                        <ActionsColumn
                          items={[{ title: 'Delete', onClick: () => setPendingDelete(bridge) }]}
                          isDisabled={busy}
                        />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          ) : null}
        </StackItem>
      </Stack>

      {/* Create local bridge */}
      <Modal variant={ModalVariant.small} isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <ModalHeader title="Create local bridge" />
        <ModalBody>
          <Form>
            <FormGroup label="Virtual Hub" fieldId="bridge-hub">
              <FormSelect
                id="bridge-hub"
                value={newHub}
                onChange={(_event, value) => setNewHub(value)}
                aria-label="Virtual Hub"
              >
                {hubs.map((hub) => (
                  <FormSelectOption key={hub} value={hub} label={hub} />
                ))}
              </FormSelect>
            </FormGroup>

            {isTapSupported && (
              <FormGroup label="Bridge destination" role="radiogroup" fieldId="bridge-mode">
                <Radio
                  id="bridge-mode-adapter"
                  name="bridge-mode"
                  label="Existing physical network adapter"
                  isChecked={mode === 'adapter'}
                  onChange={() => setMode('adapter')}
                />
                <Radio
                  id="bridge-mode-tap"
                  name="bridge-mode"
                  label="New tap device"
                  isChecked={mode === 'tap'}
                  onChange={() => setMode('tap')}
                />
              </FormGroup>
            )}

            {mode === 'adapter' ? (
              <FormGroup label="Network adapter" fieldId="bridge-adapter">
                <FormSelect
                  id="bridge-adapter"
                  value={newAdapter}
                  onChange={(_event, value) => setNewAdapter(value)}
                  aria-label="Network adapter"
                  isDisabled={adapters.length === 0}
                >
                  {adapters.length === 0 ? (
                    <FormSelectOption isDisabled value="" label="No network adapter available" />
                  ) : (
                    adapters.map((adapter) => (
                      <FormSelectOption
                        key={adapter.DeviceName_str}
                        value={adapter.DeviceName_str}
                        label={adapter.NetworkConnectionName_utf || adapter.DeviceName_str}
                      />
                    ))
                  )}
                </FormSelect>
              </FormGroup>
            ) : (
              <FormGroup label="Tap device name" fieldId="bridge-tap-name">
                <TextInput
                  id="bridge-tap-name"
                  value={tapName}
                  onChange={(_event, value) => setTapName(value.slice(0, MAX_TAP_NAME))}
                  aria-label="Tap device name"
                />
                <Content component="small">Maximum {MAX_TAP_NAME} characters.</Content>
              </FormGroup>
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

      {/* Delete confirmation */}
      <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader title="Delete local bridge" titleIconVariant="warning" />
        <ModalBody>
          Delete the local bridge between <strong>{pendingDelete?.HubNameLB_str}</strong> and{' '}
          <strong>{pendingDelete?.DeviceName_str}</strong>?
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

export { LocalBridge };
