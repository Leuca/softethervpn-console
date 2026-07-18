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

const extendedNumericOptionNames = new Set([
  'BroadcastStormDetectionThreshold',
  'ClientMinimumRequiredBuild',
  'VlanTypeId',
  'RequiredClientId',
  'AdjustTcpMssValue',
  'SecureNAT_MaxTcpSessionsPerIp',
  'SecureNAT_MaxTcpSynSentPerIp',
  'SecureNAT_MaxUdpSessionsPerIp',
  'SecureNAT_MaxDnsSessionsPerIp',
  'SecureNAT_MaxIcmpSessionsPerIp',
  'AccessListIncludeFileCacheLifetime',
  'MaxLoggedPacketsPerMinute',
  'FloodingSendQueueBufferQuota',
  'DetectDormantSessionInterval',
  'DhcpDiscoverTimeoutMs',
]);

const canChangeExtendedOptions = (user: string, adminOptions: VPN.VpnAdminOption[]): boolean =>
  user === 'Administrator' ||
  !adminOptions.some(
    (option) => option.Name_str.toLowerCase() === 'deny_hub_admin_change_ext_option' && option.Value_u32 !== 0,
  );

interface HubExtendedOptionsProps {
  hub: string;
  trigger?: (open: () => void) => React.ReactNode;
}

const HubExtendedOptions: React.FunctionComponent<HubExtendedOptionsProps> = ({ hub, trigger }) => {
  const { user } = useServer();
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<VPN.VpnAdminOption[] | null>(null);
  const [adminOptions, setAdminOptions] = React.useState<VPN.VpnAdminOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    Promise.all([
      api.GetHubExtOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub })),
      api.GetHubAdminOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub })),
    ])
      .then(([current, admin]) => {
        setOptions(current.AdminOptionList ?? []);
        setAdminOptions(admin.AdminOptionList ?? []);
      })
      .catch((e) => setError(String(e)));
  }, [hub]);

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
      .SetHubExtOptions(new VPN.VpnRpcAdminOption({ HubName_str: hub, AdminOptionList: options }))
      .then(() => {
        setSaving(false);
        setOpen(false);
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const canChange = canChangeExtendedOptions(user, adminOptions);
  const isLoading = options === null && error === null;

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Extended Options
        </Button>
      )}

      <Modal
        variant={ModalVariant.large}
        isOpen={open}
        onClose={() => setOpen(false)}
        aria-label="Virtual Hub Extended Options"
      >
        <ModalHeader title="Virtual Hub Extended Options" />
        <ModalBody>
          <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
            {error && (
              <Alert variant="danger" title="Could not load or save hub extended options" isInline>
                {error}
              </Alert>
            )}

            {isLoading ? (
              <Bullseye>
                <Spinner size="xl" aria-label="Loading hub extended options" />
              </Bullseye>
            ) : options !== null ? (
              <AdminOptionEditor
                ariaLabel="Virtual Hub Extended Options"
                options={options}
                numericOptions={extendedNumericOptionNames}
                canChange={canChange}
                onChange={setOptions}
              />
            ) : null}
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={save}
            isDisabled={options === null || saving || !canChange}
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

export { HubExtendedOptions };
