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
  Icon,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ScrollableTable } from '@app/components/ScrollableTable';
import { BanIcon, PlusCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { FormErrorAlert } from '@app/components/FormErrorAlert';
import { SecurityPolicyModal } from '@app/Hubs/SecurityPolicyModal';
import { recordChanged } from '@app/utils/dirty';

const Groups: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [groups, setGroups] = React.useState<VPN.VpnRpcEnumGroupItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [realname, setRealname] = React.useState('');
  const [note, setNote] = React.useState('');

  // Working copy of the group being edited (the full GetGroup response).
  const [edit, setEdit] = React.useState<Record<string, unknown> | null>(null);
  const [editOriginal, setEditOriginal] = React.useState<Record<string, unknown> | null>(null);
  const [policyOpen, setPolicyOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    api
      .EnumGroup(new VPN.VpnRpcEnumGroup({ HubName_str: hub }))
      .then((response) => setGroups(response.GroupList ?? []))
      .catch((e) => setError(String(e)));
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setRealname('');
    setNote('');
    setError(null);
    setCreateOpen(true);
  };

  const create = () => {
    setSubmitting(true);
    setError(null);
    api
      .CreateGroup(
        new VPN.VpnRpcSetGroup({ HubName_str: hub, Name_str: name.trim(), Realname_utf: realname, Note_utf: note }),
      )
      .then(() => {
        setSubmitting(false);
        setCreateOpen(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setSubmitting(false);
      });
  };

  const openEdit = (groupName: string) => {
    setError(null);
    api
      .GetGroup(new VPN.VpnRpcSetGroup({ HubName_str: hub, Name_str: groupName }))
      .then((response) => {
        const record = response as unknown as Record<string, unknown>;
        setEdit(record);
        setEditOriginal(record);
      })
      .catch((e) => setError(String(e)));
  };

  const setEditField = (key: string, value: unknown) => setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));

  const saveEdit = () => {
    if (!edit) {
      return;
    }
    const obj = new VPN.VpnRpcSetGroup(edit as Partial<VPN.VpnRpcSetGroup>);
    obj.HubName_str = hub; // ensure the save targets this hub even if GetGroup omits it
    setSubmitting(true);
    setError(null);
    api
      .SetGroup(obj)
      .then(() => {
        setSubmitting(false);
        setEdit(null);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setSubmitting(false);
      });
  };

  const confirmDelete = () => {
    if (pendingDelete === null) {
      return;
    }
    const groupName = pendingDelete;
    setPendingDelete(null);
    api
      .DeleteGroup(new VPN.VpnRpcDeleteUser({ HubName_str: hub, Name_str: groupName }))
      .then(() => load())
      .catch((e) => setError(String(e)));
  };

  const isLoading = groups === null && error === null;
  const editDirty = recordChanged(editOriginal, edit);

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate} isDisabled={isLoading}>
            New group
          </Button>
        </FlexItem>
      </Flex>

      {error && !createOpen && edit === null && (
        <Alert variant="danger" title="Group operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading groups" />
        </Bullseye>
      ) : groups !== null && groups.length === 0 ? (
        <EmptyState titleText="No groups" headingLevel="h2">
          <EmptyStateBody>Groups let you apply one security policy to many users.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={openCreate}>
                New group
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : groups !== null ? (
        <ScrollableTable aria-label="Groups" variant="compact">
          <Thead>
            <Tr>
              <Th>Group name</Th>
              <Th>Real name</Th>
              <Th>Note</Th>
              <Th>Users</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {groups.map((group) => (
              <Tr key={group.Name_str}>
                <Td dataLabel="Group name">
                  <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>{group.Name_str}</FlexItem>
                    {group.DenyAccess_bool && (
                      <FlexItem>
                        <Icon status="danger" title="Access denied">
                          <BanIcon />
                        </Icon>
                      </FlexItem>
                    )}
                  </Flex>
                </Td>
                <Td dataLabel="Real name">{group.Realname_utf || '-'}</Td>
                <Td dataLabel="Note">{group.Note_utf || '-'}</Td>
                <Td dataLabel="Users">{group.NumUsers_u32.toLocaleString()}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      { title: 'Edit', onClick: () => openEdit(group.Name_str) },
                      { isSeparator: true },
                      { title: 'Delete', onClick: () => setPendingDelete(group.Name_str) },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </ScrollableTable>
      ) : null}

      {/* Create group */}
      <Modal
        variant={ModalVariant.small}
        isOpen={createOpen}
        onClose={() => !submitting && setCreateOpen(false)}
      >
        <ModalHeader title="New group" />
        <ModalBody>
          <FormErrorAlert error={error} title="Group operation failed" />
          <Form>
            <FormGroup label="Group name" isRequired fieldId="group-name">
              <TextInput
                isRequired
                id="group-name"
                value={name}
                onChange={(_event, value) => setName(value)}
                aria-label="Group name"
              />
            </FormGroup>
            <FormGroup label="Real name" fieldId="group-realname">
              <TextInput
                id="group-realname"
                value={realname}
                onChange={(_event, value) => setRealname(value)}
                aria-label="Real name"
              />
            </FormGroup>
            <FormGroup label="Note" fieldId="group-note">
              <TextInput id="group-note" value={note} onChange={(_event, value) => setNote(value)} aria-label="Note" />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={create}
            isDisabled={name.trim().length === 0 || submitting}
            isLoading={submitting}
          >
            Create
          </Button>
          <Button variant="link" onClick={() => setCreateOpen(false)} isDisabled={submitting}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit group */}
      {/* Step aside while the policy sub-modal is open (stacked modals hide each
          other from screen readers); the edit state is preserved on return. */}
      <Modal
        variant={ModalVariant.small}
        isOpen={edit !== null && !policyOpen}
        onClose={() => !submitting && setEdit(null)}
      >
        <ModalHeader title={edit ? `Edit ${String(edit.Name_str)}` : ''} />
        <ModalBody>
          <FormErrorAlert error={error} title="Group operation failed" />
          {edit && (
            <Form>
              <FormGroup label="Real name" fieldId="edit-group-realname">
                <TextInput
                  id="edit-group-realname"
                  value={String(edit.Realname_utf ?? '')}
                  onChange={(_event, value) => setEditField('Realname_utf', value)}
                  aria-label="Real name"
                />
              </FormGroup>
              <FormGroup label="Note" fieldId="edit-group-note">
                <TextInput
                  id="edit-group-note"
                  value={String(edit.Note_utf ?? '')}
                  onChange={(_event, value) => setEditField('Note_utf', value)}
                  aria-label="Note"
                />
              </FormGroup>
              <FormGroup label="Security policy" fieldId="edit-group-policy">
                <Button variant="secondary" onClick={() => setPolicyOpen(true)}>
                  {edit.UsePolicy_bool ? 'Edit security policy' : 'Add security policy'}
                </Button>
              </FormGroup>
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={saveEdit} isDisabled={!editDirty || submitting} isLoading={submitting}>
            Save
          </Button>
          <Button variant="link" onClick={() => setEdit(null)} isDisabled={submitting}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete confirmation */}
      <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader title="Delete group" titleIconVariant="warning" />
        <ModalBody>
          Delete the group <strong>{pendingDelete}</strong>? Its members are not deleted, but they stop belonging to the
          group.
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

      <SecurityPolicyModal
        title={edit ? `Security policy: ${String(edit.Name_str ?? '')}` : 'Security policy'}
        subject={edit}
        isOpen={policyOpen}
        onClose={() => setPolicyOpen(false)}
        onSave={(updated) => {
          setEdit(updated);
          setPolicyOpen(false);
        }}
      />
    </Flex>
  );
};

export { Groups };
