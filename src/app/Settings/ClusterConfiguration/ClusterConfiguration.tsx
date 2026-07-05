import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
  Content,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Radio,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { mode_to_string } from '@app/utils/string_utils';

// Changing farm settings restarts the server; wait, then poll until it is back
// (same pattern as EditConfig) rather than surfacing the transient error.
const RESTART_WAIT_MS = 5000;
const RETRY_INTERVAL_MS = 3000;
const MAX_RETRIES = 12;

const DEFAULT_WEIGHT = 100;
const DEFAULT_CONTROLLER_PORT = 443;
const MIN_PORT = 1;
const MAX_PORT = 65535;

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// Parse the "Public Port List" free text into port numbers. Ports are
// separated by commas or spaces (matching the native Server Manager dialog).
const parsePorts = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => Number(p));

// Editable form state, seeded from GetFarmSetting.
interface FarmForm {
  mode: number;
  controllerOnly: boolean;
  weight: number;
  publicIp: string;
  ports: string; // raw text; parsed on validate/save
  host: string;
  controllerPort: number;
  password: string;
}

const ClusterConfig: React.FunctionComponent = () => {
  const [form, setForm] = React.useState<FarmForm | null>(null);
  const [currentMode, setCurrentMode] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const timerRef = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const fetchSettings = React.useCallback(
    () =>
      api.GetFarmSetting().then((response) => {
        setCurrentMode(response.ServerType_u32);
        setForm({
          mode: response.ServerType_u32,
          controllerOnly: response.ControllerOnly_bool ?? false,
          weight: response.Weight_u32 || DEFAULT_WEIGHT,
          publicIp: response.PublicIp_ip ?? '',
          ports: (response.Ports_u32 ?? []).join(', '),
          host: response.ControllerName_str ?? '',
          controllerPort: response.ControllerPort_u32 || DEFAULT_CONTROLLER_PORT,
          // GetFarmSetting never returns the member password; blank means the
          // server keeps the current one (SiSetServerType ignores a zero hash).
          password: response.MemberPasswordPlaintext_str ?? '',
        });
      }),
    [],
  );

  const load = React.useCallback(() => {
    setForm(null);
    setError(null);
    fetchSettings().catch((e) => setError(String(e)));
  }, [fetchSettings]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Poll for the server coming back after the restart, then reload the form.
  const waitForRestart = React.useCallback(() => {
    let attempts = 0;
    const attempt = () => {
      fetchSettings()
        .then(() => setRestarting(false))
        .catch(() => {
          attempts += 1;
          if (attempts >= MAX_RETRIES) {
            setRestarting(false);
            setError('The VPN server did not come back online in time. Use Refresh to reconnect.');
          } else {
            timerRef.current = window.setTimeout(attempt, RETRY_INTERVAL_MS);
          }
        });
    };
    timerRef.current = window.setTimeout(attempt, RESTART_WAIT_MS);
  }, [fetchSettings]);

  const setField = <K extends keyof FarmForm>(key: K, value: FarmForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  // Validation. Fields only matter in the mode they belong to.
  const ipValid = form ? form.publicIp === '' || IPV4_RE.test(form.publicIp) : true;
  const parsedPorts = form ? parsePorts(form.ports) : [];
  const portsValid = parsedPorts.length > 0 && parsedPorts.every((p) => Number.isInteger(p) && p >= MIN_PORT && p <= MAX_PORT);
  const hostValid = form ? form.host.trim() !== '' : true;
  const controllerPortValid = form ? form.controllerPort >= MIN_PORT && form.controllerPort <= MAX_PORT : true;
  const weightValid = form ? form.weight >= 1 : true;

  const formValid = (() => {
    if (!form) {
      return false;
    }
    if (form.mode === VPN.VpnRpcServerType.FarmMember) {
      return ipValid && portsValid && hostValid && controllerPortValid && weightValid;
    }
    if (form.mode === VPN.VpnRpcServerType.FarmController) {
      return weightValid;
    }
    return true; // Standalone has nothing to validate.
  })();

  const apply = () => {
    if (!form) {
      return;
    }
    setConfirmOpen(false);
    setSaving(true);
    setError(null);

    const config = new VPN.VpnRpcFarm({ ServerType_u32: form.mode });
    if (form.mode === VPN.VpnRpcServerType.FarmController) {
      config.ControllerOnly_bool = form.controllerOnly;
      config.Weight_u32 = form.weight;
    } else if (form.mode === VPN.VpnRpcServerType.FarmMember) {
      config.Ports_u32 = parsedPorts;
      config.NumPort_u32 = parsedPorts.length;
      config.PublicIp_ip = form.publicIp;
      config.ControllerName_str = form.host;
      config.ControllerPort_u32 = form.controllerPort;
      config.MemberPasswordPlaintext_str = form.password;
      config.Weight_u32 = form.weight;
    }

    api
      .SetFarmSetting(config)
      .then(() => {
        // The server restarts on success; wait for it to come back rather than
        // hitting it mid-restart and showing a transient error.
        setSaving(false);
        setForm(null);
        setRestarting(true);
        waitForRestart();
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const isLoading = form === null && error === null && !restarting;
  const busy = isLoading || saving || restarting;

  const actions = (
    <>
      <Button
        variant="secondary"
        icon={<SyncAltIcon />}
        onClick={load}
        isDisabled={busy}
        style={{ marginInlineEnd: 'var(--pf-t--global--spacer--sm)' }}
      >
        Refresh
      </Button>
      <Button variant="primary" onClick={() => setConfirmOpen(true)} isDisabled={busy || !formValid} isLoading={saving}>
        Save Changes
      </Button>
    </>
  );

  const description =
    currentMode !== null ? (
      <>
        Load balancing and fault tolerance across multiple VPN servers. Current mode:{' '}
        <Label isCompact>{mode_to_string(currentMode)}</Label>
      </>
    ) : (
      'Load balancing and fault tolerance across multiple VPN servers.'
    );

  return (
    <AppPage title="Clustering Configuration" description={description} actions={actions}>
      <Alert
        variant="warning"
        title="Changing the clustering configuration restarts the VPN server"
        isInline
        style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
      >
        All connected sessions and administration connections (including this one) are disconnected while the server
        restarts.
      </Alert>

      {error && (
        <Alert
          variant="danger"
          title="Could not load or save the clustering configuration"
          isInline
          style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
        >
          {error}
        </Alert>
      )}

      {restarting ? (
        <Bullseye>
          <div style={{ textAlign: 'center' }}>
            <Spinner size="xl" aria-label="Waiting for the VPN server to restart" />
            <Content component="p" style={{ marginBlockStart: 'var(--pf-t--global--spacer--md)' }}>
              Clustering configuration applied. Waiting for the VPN server to restart and come back online...
            </Content>
          </div>
        </Bullseye>
      ) : isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading clustering configuration" />
        </Bullseye>
      ) : form !== null ? (
        <Form style={{ maxWidth: '36rem' }}>
          <FormGroup role="radiogroup" isInline fieldId="cluster-mode" label="Clustering mode">
            <Radio
              id="cluster-mode-standalone"
              name="cluster-mode"
              label="Standalone server (no clustering)"
              isChecked={form.mode === VPN.VpnRpcServerType.Standalone}
              onChange={() => setField('mode', VPN.VpnRpcServerType.Standalone)}
            />
            <Radio
              id="cluster-mode-controller"
              name="cluster-mode"
              label="Cluster controller"
              isChecked={form.mode === VPN.VpnRpcServerType.FarmController}
              onChange={() => setField('mode', VPN.VpnRpcServerType.FarmController)}
            />
            <Radio
              id="cluster-mode-member"
              name="cluster-mode"
              label="Cluster member server"
              isChecked={form.mode === VPN.VpnRpcServerType.FarmMember}
              onChange={() => setField('mode', VPN.VpnRpcServerType.FarmMember)}
            />
          </FormGroup>

          {form.mode === VPN.VpnRpcServerType.FarmController && (
            <FormGroup fieldId="cluster-controller-only" label="Controller options">
              <Checkbox
                id="cluster-controller-only"
                label="Controller functions only (do not handle VPN sessions itself)"
                isChecked={form.controllerOnly}
                onChange={(_event, checked) => setField('controllerOnly', checked)}
              />
            </FormGroup>
          )}

          {form.mode !== VPN.VpnRpcServerType.Standalone && (
            <FormGroup label="Standard ratio in cluster" fieldId="cluster-weight">
              <TextInput
                type="number"
                id="cluster-weight"
                min={1}
                value={String(form.weight)}
                onChange={(_event, value) => setField('weight', Number(value) || 0)}
                validated={weightValid ? 'default' : 'error'}
                aria-label="Standard ratio in cluster"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={weightValid ? 'default' : 'error'}>
                    {weightValid
                      ? 'Relative performance weight for load balancing. Standard: 100.'
                      : 'Enter a value of 1 or higher.'}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}

          {form.mode === VPN.VpnRpcServerType.FarmMember && (
            <>
              <FormGroup label="Public IP address" fieldId="cluster-public-ip">
                <TextInput
                  id="cluster-public-ip"
                  value={form.publicIp}
                  onChange={(_event, value) => setField('publicIp', value)}
                  validated={ipValid ? 'default' : 'error'}
                  aria-label="Public IP address"
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={ipValid ? 'default' : 'error'}>
                      {ipValid
                        ? 'Leave empty to use the interface address used to reach the controller.'
                        : 'Enter a valid IPv4 address, or leave empty.'}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup label="Public port list" fieldId="cluster-ports">
                <TextInput
                  id="cluster-ports"
                  value={form.ports}
                  onChange={(_event, value) => setField('ports', value)}
                  validated={portsValid ? 'default' : 'error'}
                  aria-label="Public port list"
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={portsValid ? 'default' : 'error'}>
                      {portsValid
                        ? 'One or more port numbers separated by commas or spaces.'
                        : `Enter one or more port numbers (${MIN_PORT}-${MAX_PORT}) separated by commas or spaces.`}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup label="Controller host name or IP address" fieldId="cluster-host">
                <TextInput
                  id="cluster-host"
                  value={form.host}
                  onChange={(_event, value) => setField('host', value)}
                  validated={hostValid ? 'default' : 'error'}
                  aria-label="Controller host name or IP address"
                />
                {!hostValid && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">The controller host name cannot be empty.</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>

              <FormGroup label="Controller port" fieldId="cluster-controller-port">
                <TextInput
                  type="number"
                  id="cluster-controller-port"
                  min={MIN_PORT}
                  max={MAX_PORT}
                  value={String(form.controllerPort)}
                  onChange={(_event, value) => setField('controllerPort', Number(value) || 0)}
                  validated={controllerPortValid ? 'default' : 'error'}
                  aria-label="Controller port"
                />
              </FormGroup>

              <FormGroup label="Administration password" fieldId="cluster-password">
                <TextInput
                  type="password"
                  id="cluster-password"
                  value={form.password}
                  onChange={(_event, value) => setField('password', value)}
                  placeholder="Leave blank to keep the current password"
                  aria-label="Administration password"
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      Must match an administrator password on the controller. Leave blank to keep the current one.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </>
          )}
        </Form>
      ) : null}

      <Modal variant={ModalVariant.small} isOpen={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <ModalHeader title="Change clustering configuration" titleIconVariant="warning" />
        <ModalBody>
          Applying this change <strong>restarts the VPN server</strong>. All connected sessions and management
          connections (including this one) are disconnected, and you will need to reconnect. Continue?
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={apply}>
            Save and restart
          </Button>
          <Button variant="link" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  );
};

export { ClusterConfig };
