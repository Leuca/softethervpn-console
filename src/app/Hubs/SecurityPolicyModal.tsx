import * as React from 'react';
import {
  Button,
  Content,
  Divider,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  NumberInput,
  Stack,
  StackItem,
  Switch,
} from '@patternfly/react-core';
import { POLICY_FIELDS, POLICY_GROUPS, policyBool, policyInt } from '@app/Hubs/securityPolicy';
import { recordChanged } from '@app/utils/dirty';

interface SecurityPolicyModalProps {
  title: string;
  /** The user or group object (carries the inline policy:* fields + UsePolicy_bool). */
  subject: Record<string, unknown> | null;
  isOpen: boolean;
  onClose: () => void;
  /** Receives a copy of the subject with the edited policy applied. */
  onSave: (updated: Record<string, unknown>) => void;
  /** Users/groups gate policy fields with UsePolicy; cascades always carry policy fields. */
  hasUsePolicySwitch?: boolean;
}

/**
 * Shared editor for a subject's security policy. SoftEther attaches the same
 * policy set to users and groups (guarded by UsePolicy_bool), so both the Users
 * and Groups tabs open this one modal and merge the result back into their edit
 * object before saving.
 */
const SecurityPolicyModal: React.FunctionComponent<SecurityPolicyModalProps> = ({
  title,
  subject,
  isOpen,
  onClose,
  onSave,
  hasUsePolicySwitch = true,
}) => {
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [original, setOriginal] = React.useState<Record<string, unknown> | null>(null);

  // Seed a working copy each time the modal opens.
  React.useEffect(() => {
    if (isOpen && subject) {
      const next = { ...subject };
      setDraft(next);
      setOriginal(next);
    }
  }, [isOpen, subject]);

  const usePolicy = !hasUsePolicySwitch || draft.UsePolicy_bool === true;
  const setField = (key: string, value: unknown) => setDraft((prev) => ({ ...prev, [key]: value }));
  const clampInt = (value: number) => (Number.isNaN(value) || value < 0 ? 0 : value);
  const dirty = recordChanged(original, draft);
  const apply = () => {
    if (hasUsePolicySwitch) {
      onSave(draft);
      return;
    }
    const updated: Record<string, unknown> = { ...draft, 'policy:Ver3_bool': true };
    delete updated.UsePolicy_bool;
    onSave(updated);
  };

  return (
    <Modal variant={ModalVariant.medium} isOpen={isOpen} onClose={onClose}>
      <ModalHeader title={title} />
      <ModalBody>
        <Stack hasGutter>
          {hasUsePolicySwitch && (
            <StackItem>
              <Switch
                id="policy-enabled"
                label="Apply a security policy to this object"
                isChecked={usePolicy}
                onChange={(_event, checked) => setField('UsePolicy_bool', checked)}
              />
            </StackItem>
          )}

          {POLICY_GROUPS.map((group) => {
            const fields = POLICY_FIELDS.filter((f) => f.group === group.id);
            return (
              <StackItem key={group.id}>
                <Divider style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }} />
                <Content component="h3">{group.title}</Content>
                <Form>
                  {fields.map((field) =>
                    field.kind === 'bool' ? (
                      <Switch
                        key={field.key}
                        id={field.key}
                        label={field.label}
                        isChecked={policyBool(draft, field.key)}
                        onChange={(_event, checked) => setField(field.key, checked)}
                        isDisabled={!usePolicy}
                      />
                    ) : (
                      <FormGroup key={field.key} label={field.label} fieldId={field.key}>
                        <NumberInput
                          id={field.key}
                          value={policyInt(draft, field.key)}
                          min={0}
                          onMinus={() => setField(field.key, clampInt(policyInt(draft, field.key) - 1))}
                          onPlus={() => setField(field.key, clampInt(policyInt(draft, field.key) + 1))}
                          onChange={(event) =>
                            setField(field.key, clampInt(Number((event.target as HTMLInputElement).value)))
                          }
                          inputName={field.key}
                          inputAriaLabel={field.label}
                          minusBtnAriaLabel={`Decrease ${field.label}`}
                          plusBtnAriaLabel={`Increase ${field.label}`}
                          isDisabled={!usePolicy}
                        />
                        {field.unit && <Content component="small">{field.unit}</Content>}
                      </FormGroup>
                    ),
                  )}
                </Form>
              </StackItem>
            );
          })}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={apply} isDisabled={!dirty}>
          Apply
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export { SecurityPolicyModal };
