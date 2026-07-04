import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Switch,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';

const PROTOCOLS: Record<number, string> = { 0: 'Any', 1: 'ICMPv4', 6: 'TCP', 17: 'UDP', 58: 'ICMPv6' };
const protocolLabel = (n: number): string => PROTOCOLS[n] ?? `IP ${n}`;

// Compact source/destination summary for the list; IPv6 detail is left to the
// (future) rule editor.
function endpoint(ip: string, mask: string, ipv6: boolean): string {
  if (ipv6) {
    return 'IPv6';
  }
  if (!ip || (ip === '0.0.0.0' && mask === '0.0.0.0')) {
    return 'any';
  }
  return mask === '255.255.255.255' ? ip : `${ip}/${mask}`;
}

const AccessList: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [rules, setRules] = React.useState<VPN.VpnAccess[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<number | null>(null);

  const load = React.useCallback(() => {
    setRules(null);
    setError(null);
    api
      .EnumAccess(new VPN.VpnRpcEnumAccessList({ HubName_str: hub }))
      .then((response) => setRules(response.AccessList ?? []))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  // SetAccessList replaces the whole list, so send every rule back with the one
  // toggled.
  const toggleActive = (id: number, active: boolean) => {
    if (!rules) {
      return;
    }
    setBusy(true);
    const next = rules.map((r) => (r.Id_u32 === id ? { ...r, Active_bool: active } : r));
    api
      .SetAccessList(new VPN.VpnRpcEnumAccessList({ HubName_str: hub, AccessList: next as VPN.VpnAccess[] }))
      .then(() => {
        setBusy(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
  };

  const confirmDelete = () => {
    if (pendingDelete === null) {
      return;
    }
    const id = pendingDelete;
    setPendingDelete(null);
    api
      .DeleteAccess(new VPN.VpnRpcDeleteAccess({ HubName_str: hub, Id_u32: id }))
      .then(() => load())
      .catch((e) => setError(String(e)));
  };

  const isLoading = rules === null && error === null;

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }}>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading}>
            Refresh
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="Access list operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading access list" />
        </Bullseye>
      ) : rules !== null && rules.length === 0 ? (
        <EmptyState titleText="No access list rules" headingLevel="h2">
          <EmptyStateBody>With no rules, all packets are passed. Rules are evaluated by priority.</EmptyStateBody>
        </EmptyState>
      ) : rules !== null ? (
        <Table aria-label="Access list" variant="compact">
          <Thead>
            <Tr>
              <Th>Priority</Th>
              <Th>Action</Th>
              <Th>Protocol</Th>
              <Th>Source</Th>
              <Th>Destination</Th>
              <Th>Note</Th>
              <Th>Active</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {rules.map((rule) => (
              <Tr key={rule.Id_u32}>
                <Td dataLabel="Priority">{rule.Priority_u32.toLocaleString()}</Td>
                <Td dataLabel="Action">
                  <Label color={rule.Discard_bool ? 'red' : 'green'} isCompact>
                    {rule.Discard_bool ? 'Discard' : 'Pass'}
                  </Label>
                </Td>
                <Td dataLabel="Protocol">{protocolLabel(rule.Protocol_u32)}</Td>
                <Td dataLabel="Source">{endpoint(rule.SrcIpAddress_ip, rule.SrcSubnetMask_ip, rule.IsIPv6_bool)}</Td>
                <Td dataLabel="Destination">
                  {endpoint(rule.DestIpAddress_ip, rule.DestSubnetMask_ip, rule.IsIPv6_bool)}
                </Td>
                <Td dataLabel="Note">{rule.Note_utf || '-'}</Td>
                <Td dataLabel="Active">
                  <Switch
                    id={`access-active-${rule.Id_u32}`}
                    aria-label={`Rule ${rule.Id_u32} active`}
                    isChecked={rule.Active_bool}
                    isDisabled={busy}
                    onChange={(_event, checked) => toggleActive(rule.Id_u32, checked)}
                  />
                </Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[{ title: 'Delete', onClick: () => setPendingDelete(rule.Id_u32) }]}
                    isDisabled={busy}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}

      <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader title="Delete rule" titleIconVariant="warning" />
        <ModalBody>Delete access list rule #{pendingDelete}?</ModalBody>
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

export { AccessList };
