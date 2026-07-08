import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
} from '@patternfly/react-core';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { AdminOptionEditor } from '@app/Hubs/AdminOptionEditor';
import { useServer } from '@app/ServerContext';
import { api } from '@app/utils/vpnrpc_settings';

const capValue = (capsList: unknown[], name: string): number | null => {
  const cap = capsList.find((item) => (item as VPN.VpnCaps).CapsName_str === name) as VPN.VpnCaps | undefined;
  return cap ? cap.CapsValue_u32 : null;
};

const capBool = (capsList: unknown[], name: string): boolean => {
  const value = capValue(capsList, name);
  return value === null ? true : value !== 0;
};

const canChangeAdminOptions = (user: string, options: VPN.VpnAdminOption[]): boolean =>
  user === 'Administrator' ||
  options.some(
    (option) => option.Name_str.toLowerCase() === 'allow_hub_admin_change_option' && option.Value_u32 !== 0,
  );

const HubAdminOptions: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const { capsList, user } = useServer();
  const supported = capBool(capsList, 'b_support_hub_admin_option');
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<VPN.VpnAdminOption[] | null>(null);
  const [defaultOptions, setDefaultOptions] = React.useState<VPN.VpnAdminOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    if (!supported) {
      setOptions([]);
      setDefaultOptions([]);
      setError(null);
      return;
    }
    setOptions(null);
    setDefaultOptions([]);
    setError(null);
    Promise.all([
      api.GetHubAdminOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub })),
      api.GetDefaultHubAdminOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub })),
    ])
      .then(([current, defaults]) => {
        setOptions(current.AdminOptionList ?? []);
        setDefaultOptions(defaults.AdminOptionList ?? []);
      })
      .catch((e) => setError(String(e)));
  }, [hub, supported]);

  React.useEffect(() => {
    if (open) {
      load();
    }
  }, [load, open]);

  const save = () => {
    if (options === null) {
      return;
    }
    setSaving(true);
    setError(null);
    api
      .SetHubAdminOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub, AdminOptionList: options }))
      .then(() => {
        setSaving(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const isLoading = supported && options === null && error === null;

  if (!supported) {
    return null;
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Administration Options
      </Button>

      <Modal
        variant={ModalVariant.large}
        isOpen={open}
        onClose={() => setOpen(false)}
        aria-label="Virtual Hub Administration Options"
      >
        <ModalHeader title="Virtual Hub Administration Options" />
        <ModalBody>
          <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
            {error && (
              <Alert variant="danger" title="Could not load or save hub administration options" isInline>
                {error}
              </Alert>
            )}

            {isLoading ? (
              <Bullseye>
                <Spinner size="xl" aria-label="Loading hub administration options" />
              </Bullseye>
            ) : options !== null ? (
              <AdminOptionEditor
                ariaLabel="Virtual Hub Administration Options"
                options={options}
                defaultOptions={defaultOptions}
                canChange={canChangeAdminOptions(user, options)}
                onChange={setOptions}
              />
            ) : null}
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={save}
            isDisabled={options === null || saving || !canChangeAdminOptions(user, options)}
            isLoading={saving}
          >
            Save options
          </Button>
          <Button variant="link" onClick={() => setOpen(false)} isDisabled={saving}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export { HubAdminOptions };
