import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  Flex,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Radio,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { PlusCircleIcon, SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { useServer } from '@app/ServerContext';
import { api } from '@app/utils/vpnrpc_settings';

type RuleDraft = {
  id: number | null;
  action: 'allow' | 'deny';
  priority: string;
  ipVersion: 'ipv4' | 'ipv6';
  masked: boolean;
  ipAddress: string;
  subnetMask: string;
};

const ZERO4 = '0.0.0.0';
const FULL4 = '255.255.255.255';

const parseInteger = (value: string): number | null => {
  const text = value.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  return Number(text);
};

const parseIpv4 = (value: string): number[] | null => {
  const parts = value.trim().split('.');
  if (parts.length !== 4) {
    return null;
  }
  const bytes = parts.map((part) => parseInteger(part));
  if (bytes.some((part) => part === null || part < 0 || part > 255)) {
    return null;
  }
  return bytes as number[];
};

const isIpv4 = (value: string): boolean => parseIpv4(value) !== null;

const parseIpv4Tail = (value: string): number[] | null => {
  const bytes = parseIpv4(value);
  if (!bytes) {
    return null;
  }
  return [(bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]];
};

const parseIpv6Part = (value: string): number[] | null => {
  if (value === '') {
    return [];
  }
  const pieces = value.split(':');
  const groups: number[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (piece.includes('.')) {
      if (i !== pieces.length - 1) {
        return null;
      }
      const tail = parseIpv4Tail(piece);
      if (!tail) {
        return null;
      }
      groups.push(...tail);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) {
      return null;
    }
    groups.push(parseInt(piece, 16));
  }
  return groups;
};

const isIpv6 = (value: string): boolean => {
  const text = value.trim();
  if (!text) {
    return false;
  }
  const split = text.split('::');
  if (split.length > 2) {
    return false;
  }
  const head = parseIpv6Part(split[0]);
  const tail = split.length === 2 ? parseIpv6Part(split[1]) : [];
  if (!head || !tail) {
    return false;
  }
  const missing = 8 - head.length - tail.length;
  return (split.length === 1 && missing === 0) || (split.length === 2 && missing >= 1);
};

const isIpv6Mask = (value: string): boolean => {
  const text = value.trim();
  if (text.startsWith('/')) {
    const prefix = parseInteger(text.slice(1));
    return prefix !== null && prefix >= 0 && prefix <= 128;
  }
  return isIpv6(text);
};

const ipv6MaskFromPrefix = (prefix: number): string => {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < prefix; i++) {
    bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
  }
  const groups: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  }
  return groups.join(':');
};

const normalizeSubnetMask = (draft: RuleDraft): string => {
  if (!draft.masked) {
    return draft.ipVersion === 'ipv4' ? FULL4 : '';
  }
  const mask = draft.subnetMask.trim();
  if (draft.ipVersion === 'ipv6' && mask.startsWith('/')) {
    return ipv6MaskFromPrefix(Number(mask.slice(1)));
  }
  return mask;
};

const capBool = (capsList: unknown[], name: string): boolean => {
  const cap = capsList.find((item) => (item as VPN.VpnCaps).CapsName_str === name) as VPN.VpnCaps | undefined;
  return cap ? cap.CapsValue_u32 !== 0 : false;
};

const canChangeAccessControl = (user: string, adminOptions: VPN.VpnAdminOption[]): boolean =>
  user === 'Administrator' ||
  !adminOptions.some(
    (option) => option.Name_str.toLowerCase() === 'no_change_access_control_list' && option.Value_u32 !== 0,
  );

const ruleAddress = (rule: VPN.VpnAc): string =>
  rule.Masked_bool ? `${rule.IpAddress_ip}/${rule.SubnetMask_ip}` : rule.IpAddress_ip;

const sortRules = (rules: VPN.VpnAc[]): VPN.VpnAc[] =>
  [...rules].sort((a, b) => a.Priority_u32 - b.Priority_u32 || Number(a.Deny_bool) - Number(b.Deny_bool));

const normalizeRules = (rules: VPN.VpnAc[]): VPN.VpnAc[] =>
  sortRules(rules).map((rule, index) => new VPN.VpnAc({ ...rule, Id_u32: index + 1 }));

const defaultDraft = (rules: VPN.VpnAc[]): RuleDraft => ({
  id: null,
  action: 'allow',
  priority: String((rules.length ? Math.max(...rules.map((rule) => rule.Priority_u32)) : 0) + 100),
  ipVersion: 'ipv4',
  masked: false,
  ipAddress: '',
  subnetMask: '',
});

const draftFromRule = (rule: VPN.VpnAc): RuleDraft => ({
  id: rule.Id_u32,
  action: rule.Deny_bool ? 'deny' : 'allow',
  priority: String(rule.Priority_u32),
  ipVersion: rule.IpAddress_ip.includes(':') ? 'ipv6' : 'ipv4',
  masked: rule.Masked_bool,
  ipAddress: rule.IpAddress_ip,
  subnetMask: rule.Masked_bool ? rule.SubnetMask_ip : '',
});

const validateDraft = (draft: RuleDraft): string[] => {
  const errors: string[] = [];
  const priority = parseInteger(draft.priority);
  if (priority === null || priority < 1) {
    errors.push('Priority must be 1 or higher.');
  }
  if (draft.ipVersion === 'ipv4') {
    if (!isIpv4(draft.ipAddress)) {
      errors.push('Enter a valid IPv4 address.');
    } else if (!draft.masked && (draft.ipAddress === ZERO4 || draft.ipAddress === FULL4)) {
      errors.push('A single IPv4 address cannot be 0.0.0.0 or 255.255.255.255.');
    } else if (draft.masked && draft.ipAddress === FULL4) {
      errors.push('A masked IPv4 address cannot be 255.255.255.255.');
    }
    if (draft.masked && !isIpv4(draft.subnetMask)) {
      errors.push('Enter a valid IPv4 subnet mask.');
    }
  } else {
    if (!isIpv6(draft.ipAddress)) {
      errors.push('Enter a valid IPv6 address.');
    }
    if (draft.masked && !isIpv6Mask(draft.subnetMask)) {
      errors.push('Enter a valid IPv6 mask or prefix.');
    }
  }
  return errors;
};

const ruleFromDraft = (draft: RuleDraft): VPN.VpnAc =>
  new VPN.VpnAc({
    Id_u32: draft.id ?? 0,
    Priority_u32: Number(draft.priority),
    Deny_bool: draft.action === 'deny',
    Masked_bool: draft.masked,
    IpAddress_ip: draft.ipAddress.trim(),
    SubnetMask_ip: normalizeSubnetMask(draft),
  });

const HubSourceAccessControl: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const { capsList, user } = useServer();
  const supportsIpv6 = capBool(capsList, 'b_support_ipv6_ac');
  const [open, setOpen] = React.useState(false);
  const [rules, setRules] = React.useState<VPN.VpnAc[] | null>(null);
  const [adminOptions, setAdminOptions] = React.useState<VPN.VpnAdminOption[]>([]);
  const [draft, setDraft] = React.useState<RuleDraft | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setRules(null);
    setAdminOptions([]);
    setDraft(null);
    setPendingDelete(null);
    setError(null);
    Promise.all([
      api.GetAcList(new VPN.VpnRpcAcList({ HubName_str: hub })),
      api.GetHubAdminOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub })),
    ])
      .then(([current, admin]) => {
        setRules(normalizeRules(current.ACList ?? []));
        setAdminOptions(admin.AdminOptionList ?? []);
      })
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    if (open) {
      load();
    }
  }, [load, open]);

  const canChange = canChangeAccessControl(user, adminOptions);
  const isLoading = rules === null && error === null;
  const validation = draft ? validateDraft(draft) : [];

  const setDraftField = (patch: Partial<RuleDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveDraft = () => {
    if (!draft || !rules || validation.length > 0) {
      return;
    }
    const next = ruleFromDraft(draft);
    setRules(
      normalizeRules(
        draft.id === null ? [...rules, next] : rules.map((rule) => (rule.Id_u32 === draft.id ? next : rule)),
      ),
    );
    setDraft(null);
  };

  const deleteRule = () => {
    if (pendingDelete === null || !rules) {
      return;
    }
    setRules(normalizeRules(rules.filter((rule) => rule.Id_u32 !== pendingDelete)));
    setPendingDelete(null);
  };

  const save = () => {
    if (rules === null) {
      return;
    }
    setSaving(true);
    setError(null);
    api
      .SetAcList(new VPN.VpnRpcAcList({ HubName_str: hub, ACList: rules }))
      .then(() => {
        setSaving(false);
        setOpen(false);
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Source IP Access Control
      </Button>

      <Modal
        variant={ModalVariant.large}
        isOpen={open && draft === null && pendingDelete === null}
        onClose={() => setOpen(false)}
        aria-label="Source IP Access Control"
      >
        <ModalHeader title="Source IP Access Control" />
        <ModalBody>
          <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
            <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
              <Button
                variant="secondary"
                icon={<PlusCircleIcon />}
                onClick={() => rules && setDraft(defaultDraft(rules))}
                isDisabled={rules === null || saving || !canChange}
              >
                Add rule
              </Button>
              <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading || saving}>
                Refresh rules
              </Button>
            </Flex>

            {error && (
              <Alert variant="danger" title="Could not load or save source IP access control" isInline>
                {error}
              </Alert>
            )}
            {!canChange && rules !== null && (
              <Alert variant="info" title="Rules are read-only" isInline>
                This connection cannot modify source IP access control rules.
              </Alert>
            )}

            {isLoading ? (
              <Bullseye>
                <Spinner size="xl" aria-label="Loading source IP access control" />
              </Bullseye>
            ) : rules !== null && rules.length === 0 ? (
              <EmptyState titleText="No source IP access control rules" headingLevel="h2">
                <EmptyStateBody>With no rules, connections are allowed unless another server setting rejects them.</EmptyStateBody>
              </EmptyState>
            ) : rules !== null ? (
              <Table aria-label="Source IP Access Control" variant="compact" gridBreakPoint="grid-md">
                <Thead>
                  <Tr>
                    <Th width={10}>ID</Th>
                    <Th width={15}>Priority</Th>
                    <Th width={15}>Action</Th>
                    <Th>Source IP</Th>
                    <Th screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {rules.map((rule) => (
                    <Tr key={rule.Id_u32}>
                      <Td dataLabel="ID">{rule.Id_u32}</Td>
                      <Td dataLabel="Priority">{rule.Priority_u32}</Td>
                      <Td dataLabel="Action">{rule.Deny_bool ? 'Deny' : 'Allow'}</Td>
                      <Td dataLabel="Source IP" modifier="breakWord">
                        {ruleAddress(rule)}
                      </Td>
                      <Td isActionCell>
                        <ActionsColumn
                          items={[
                            { title: 'Edit', onClick: () => setDraft(draftFromRule(rule)), isDisabled: !canChange },
                            { title: 'Delete', onClick: () => setPendingDelete(rule.Id_u32), isDisabled: !canChange },
                          ]}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            ) : null}
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={save}
            isDisabled={rules === null || saving || !canChange}
            isLoading={saving}
          >
            Save rules
          </Button>
          <Button variant="link" onClick={() => setOpen(false)} isDisabled={saving}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <Modal variant={ModalVariant.medium} isOpen={draft !== null} onClose={() => setDraft(null)} aria-label="Source IP rule">
        <ModalHeader title={draft?.id === null ? 'Add source IP rule' : `Edit source IP rule #${draft?.id}`} />
        <ModalBody>
          {draft && (
            <Form>
              {validation.length > 0 && (
                <Alert variant="danger" title="Rule is incomplete" isInline>
                  {validation.join(' ')}
                </Alert>
              )}
              <FormGroup label="Action" fieldId="source-ac-action">
                <FormSelect
                  id="source-ac-action"
                  value={draft.action}
                  onChange={(_event, value) => setDraftField({ action: value as RuleDraft['action'] })}
                  aria-label="Action"
                >
                  <FormSelectOption value="allow" label="Allow" />
                  <FormSelectOption value="deny" label="Deny" />
                </FormSelect>
              </FormGroup>
              <FormGroup label="Priority" fieldId="source-ac-priority">
                <TextInput
                  type="number"
                  min={1}
                  id="source-ac-priority"
                  value={draft.priority}
                  onChange={(_event, value) => setDraftField({ priority: value })}
                  aria-label="Priority"
                />
              </FormGroup>
              <FormGroup label="IP version" fieldId="source-ac-ipv4">
                <Radio
                  id="source-ac-ipv4"
                  name="source-ac-ip-version"
                  label="IPv4"
                  isChecked={draft.ipVersion === 'ipv4'}
                  onChange={() => setDraftField({ ipVersion: 'ipv4', ipAddress: '', subnetMask: '' })}
                />
                <Radio
                  id="source-ac-ipv6"
                  name="source-ac-ip-version"
                  label="IPv6"
                  isChecked={draft.ipVersion === 'ipv6'}
                  isDisabled={!supportsIpv6}
                  onChange={() => setDraftField({ ipVersion: 'ipv6', ipAddress: '', subnetMask: '' })}
                />
              </FormGroup>
              <FormGroup label="Match" fieldId="source-ac-single">
                <Radio
                  id="source-ac-single"
                  name="source-ac-match"
                  label="Single address"
                  isChecked={!draft.masked}
                  onChange={() => setDraftField({ masked: false, subnetMask: '' })}
                />
                <Radio
                  id="source-ac-masked"
                  name="source-ac-match"
                  label="Subnet"
                  isChecked={draft.masked}
                  onChange={() => setDraftField({ masked: true })}
                />
              </FormGroup>
              <FormGroup label="IP address" fieldId="source-ac-ip">
                <TextInput
                  id="source-ac-ip"
                  value={draft.ipAddress}
                  onChange={(_event, value) => setDraftField({ ipAddress: value })}
                  aria-label="IP address"
                  placeholder={draft.ipVersion === 'ipv4' ? '192.0.2.10' : '2001:db8::1'}
                />
              </FormGroup>
              {draft.masked && (
                <FormGroup label="Subnet mask" fieldId="source-ac-mask">
                  <TextInput
                    id="source-ac-mask"
                    value={draft.subnetMask}
                    onChange={(_event, value) => setDraftField({ subnetMask: value })}
                    aria-label="Subnet mask"
                    placeholder={draft.ipVersion === 'ipv4' ? '255.255.255.0' : '/64'}
                  />
                </FormGroup>
              )}
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={saveDraft} isDisabled={validation.length > 0}>
            {draft?.id === null ? 'Add rule' : 'Save rule'}
          </Button>
          <Button variant="link" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        variant={ModalVariant.small}
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        aria-label="Delete source IP rule"
      >
        <ModalHeader title="Delete source IP rule" titleIconVariant="warning" />
        <ModalBody>Delete source IP access control rule #{pendingDelete}?</ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={deleteRule}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export { HubSourceAccessControl };
