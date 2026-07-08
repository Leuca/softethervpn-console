import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextArea,
} from '@patternfly/react-core';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { binToBytes } from '@app/utils/blob_utils';
import { useServer } from '@app/ServerContext';
import { api } from '@app/utils/vpnrpc_settings';

const MAX_MESSAGE_LENGTH = 20000;

const decodeMessage = (value: unknown): string => {
  if (ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(value as Uint8Array);
  }
  const bytes = binToBytes(value);
  return bytes ? new TextDecoder().decode(bytes) : '';
};

const encodeMessage = (value: string): Uint8Array => new TextEncoder().encode(value);

const canChangeMessage = (user: string, options: VPN.VpnAdminOption[]): boolean =>
  user === 'Administrator' ||
  !options.some((option) => option.Name_str.toLowerCase() === 'no_change_msg' && option.Value_u32 !== 0);

const HubMessage: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const { user } = useServer();
  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [useMessage, setUseMessage] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [adminOptions, setAdminOptions] = React.useState<VPN.VpnAdminOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    Promise.all([
      api.GetHubMsg(new VPN.VpnRpcMsg({ HubName_str: hub })),
      api
        .GetHubAdminOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub }))
        .then((response) => response.AdminOptionList ?? [])
        .catch(() => []),
    ])
      .then(([response, options]) => {
        const text = decodeMessage((response as unknown as Record<string, unknown>).Msg_bin);
        setMessage(text);
        setUseMessage(text.length > 0);
        setAdminOptions(options);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  }, [hub]);

  const openModal = () => {
    setOpen(true);
    load();
  };

  const closeModal = () => {
    if (!saving) {
      setOpen(false);
    }
  };

  const save = () => {
    if (!canChange) {
      return;
    }
    setSaving(true);
    api
      .SetHubMsg(
        new VPN.VpnRpcMsg({
          HubName_str: hub,
          Msg_bin: useMessage ? encodeMessage(message) : new Uint8Array(),
        }),
      )
      .then(() => {
        setSaving(false);
        setOpen(false);
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const isLoading = !loaded && error === null;
  const isValid = !useMessage || (message.length > 0 && message.length <= MAX_MESSAGE_LENGTH);
  const canChange = canChangeMessage(user, adminOptions);

  return (
    <>
      <FormGroup label="Client connection message" fieldId="hub-message-open">
        <Button id="hub-message-open" variant="secondary" aria-label="Set the Message" onClick={openModal}>
          Set the Message
        </Button>
      </FormGroup>

      <Modal variant={ModalVariant.medium} isOpen={open} onClose={closeModal}>
        <ModalHeader title="Set the Message" />
        <ModalBody>
          {error && (
            <Alert variant="danger" title="Hub message operation failed" isInline>
              {error}
            </Alert>
          )}
          {!canChange && loaded && (
            <Alert variant="info" title="Message is read-only" isInline>
              This connection cannot modify the client connection message.
            </Alert>
          )}

          {isLoading ? (
            <Bullseye>
              <Spinner size="xl" aria-label="Loading hub message" />
            </Bullseye>
          ) : loaded ? (
            <Form>
              <FormGroup fieldId="hub-message-enabled">
                <Checkbox
                  id="hub-message-enabled"
                  label="Show Message"
                  isChecked={useMessage}
                  isDisabled={!canChange}
                  onChange={(_event, checked) => setUseMessage(checked)}
                />
              </FormGroup>
              <FormGroup label="Message" fieldId="hub-message-text">
                <TextArea
                  id="hub-message-text"
                  value={message}
                  maxLength={MAX_MESSAGE_LENGTH}
                  isDisabled={!useMessage || !canChange}
                  onChange={(_event, value) => setMessage(value)}
                  aria-label="Message"
                  resizeOrientation="vertical"
                  validated={isValid ? 'default' : 'error'}
                  style={{ minHeight: '14rem' }}
                />
              </FormGroup>
            </Form>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={save}
            isDisabled={!loaded || saving || !isValid || !canChange}
            isLoading={saving}
          >
            Save
          </Button>
          <Button variant="link" onClick={closeModal} isDisabled={saving}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export { HubMessage };
