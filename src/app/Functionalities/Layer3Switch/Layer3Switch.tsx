import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { PlusCircleIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';

const parseIPv4 = (value: string): number | null => {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    result = ((result << 8) | octet) >>> 0;
  }

  return result;
};

const isIPv4 = (value: string): boolean => parseIPv4(value) !== null;
const isHostIPv4 = (value: string): boolean => {
  const ip = parseIPv4(value);
  return ip !== null && ip !== 0 && ip !== 0xffffffff;
};
const isSubnetMask = (value: string): boolean => {
  const mask = parseIPv4(value);
  if (mask === null) {
    return false;
  }

  for (let bits = 0; bits <= 32; bits++) {
    const validMask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (mask === validMask) {
      return true;
    }
  }

  return false;
};
const isInterfaceAddress = (ipValue: string, maskValue: string): boolean => {
  const ip = parseIPv4(ipValue);
  const mask = parseIPv4(maskValue);
  if (ip === null || mask === null || !isHostIPv4(ipValue) || !isSubnetMask(maskValue)) {
    return false;
  }

  return ((ip & (~mask >>> 0)) >>> 0) !== 0;
};
const isNetworkAddress = (ipValue: string, maskValue: string): boolean => {
  const ip = parseIPv4(ipValue);
  const mask = parseIPv4(maskValue);
  return ip !== null && mask !== null && isSubnetMask(maskValue) && ((ip & mask) >>> 0) === ip;
};
const parseMetric = (value: string): number | null => {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const metric = Number(value);
  return metric >= 1 && metric <= 0xffffffff ? metric : null;
};

const hostIpValidated = (value: string): 'default' | 'error' => (value === '' || isHostIPv4(value) ? 'default' : 'error');
const subnetMaskValidated = (value: string): 'default' | 'error' => (value === '' || isSubnetMask(value) ? 'default' : 'error');
const interfaceIpValidated = (ipValue: string, maskValue: string): 'default' | 'error' => {
  if (ipValue === '') {
    return 'default';
  }
  if (!isHostIPv4(ipValue)) {
    return 'error';
  }
  if (maskValue !== '' && isSubnetMask(maskValue) && !isInterfaceAddress(ipValue, maskValue)) {
    return 'error';
  }
  return 'default';
};
const metricValidated = (value: string): 'default' | 'error' => (value === '' || parseMetric(value) !== null ? 'default' : 'error');

const helperVariant = (valid: boolean): 'default' | 'error' => (valid ? 'default' : 'error');

const interfaceIpHelp = (ipValue: string, maskValue: string): { variant: 'default' | 'error'; text: string } => {
  if (ipValue === '') {
    return { variant: 'default', text: 'Enter a host IPv4 address.' };
  }
  if (!isHostIPv4(ipValue)) {
    return { variant: 'error', text: 'Enter a host IPv4 address other than 0.0.0.0 or 255.255.255.255.' };
  }
  if (maskValue !== '' && isSubnetMask(maskValue) && !isInterfaceAddress(ipValue, maskValue)) {
    return { variant: 'error', text: 'The address cannot be the network address for this subnet.' };
  }
  return { variant: 'default', text: 'Host IPv4 address for this virtual interface.' };
};
const networkAddressHelp = (ipValue: string, maskValue: string): { variant: 'default' | 'error'; text: string } => {
  if (ipValue === '') {
    return { variant: 'default', text: 'Enter a network IPv4 address.' };
  }
  if (!isIPv4(ipValue)) {
    return { variant: 'error', text: 'Enter a valid IPv4 address.' };
  }
  if (maskValue !== '' && isSubnetMask(maskValue) && !isNetworkAddress(ipValue, maskValue)) {
    return { variant: 'error', text: 'The network address must match the subnet mask.' };
  }
  return { variant: 'default', text: 'Network IPv4 address for this route.' };
};
const maskHelp = (value: string): { variant: 'default' | 'error'; text: string } => ({
  variant: helperVariant(value === '' || isSubnetMask(value)),
  text: 'Enter a contiguous IPv4 subnet mask.',
});
const hostHelp = (value: string): { variant: 'default' | 'error'; text: string } => {
  if (value === '') {
    return { variant: 'default', text: 'Enter a gateway host IPv4 address.' };
  }
  if (!isHostIPv4(value)) {
    return { variant: 'error', text: 'Enter a usable host IPv4 address other than 0.0.0.0 or 255.255.255.255.' };
  }
  return { variant: 'default', text: 'Next-hop gateway host address.' };
};
const metricHelp = (value: string): { variant: 'default' | 'error'; text: string } => ({
  variant: helperVariant(value === '' || parseMetric(value) !== null),
  text: 'Metric must be a whole number from 1 to 4294967295.',
});
const networkAddressValidated = (ipValue: string, maskValue: string): 'default' | 'error' => {
  if (ipValue === '') {
    return 'default';
  }
  if (!isIPv4(ipValue)) {
    return 'error';
  }
  if (maskValue !== '' && isSubnetMask(maskValue) && !isNetworkAddress(ipValue, maskValue)) {
    return 'error';
  }
  return 'default';
};

const Layer3Switch: React.FunctionComponent = () => {
  const [switches, setSwitches] = React.useState<VPN.VpnRpcEnumL3SwItem[] | null>(null);
  const [hubs, setHubs] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [selected, setSelected] = React.useState<string | null>(null);
  const [ifs, setIfs] = React.useState<VPN.VpnRpcL3If[] | null>(null);
  const [routes, setRoutes] = React.useState<VPN.VpnRpcL3Table[] | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  const [ifOpen, setIfOpen] = React.useState(false);
  const [ifHub, setIfHub] = React.useState('');
  const [ifIp, setIfIp] = React.useState('');
  const [ifMask, setIfMask] = React.useState('');

  const [routeOpen, setRouteOpen] = React.useState(false);
  const [rNet, setRNet] = React.useState('');
  const [rMask, setRMask] = React.useState('');
  const [rGw, setRGw] = React.useState('');
  const [rMetric, setRMetric] = React.useState('1');

  const [pendingSwitch, setPendingSwitch] = React.useState<string | null>(null);
  const [pendingIf, setPendingIf] = React.useState<VPN.VpnRpcL3If | null>(null);
  const [pendingRoute, setPendingRoute] = React.useState<VPN.VpnRpcL3Table | null>(null);

  const loadDetail = React.useCallback((name: string, preserveCurrent = false) => {
    if (!preserveCurrent) {
      setIfs(null);
      setRoutes(null);
    }
    api
      .EnumL3If(new VPN.VpnRpcEnumL3If({ Name_str: name }))
      .then((response) => setIfs(response.L3IFList ?? []))
      .catch((e) => setError(String(e)));
    api
      .EnumL3Table(new VPN.VpnRpcEnumL3Table({ Name_str: name }))
      .then((response) => setRoutes(response.L3Table ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  const load = React.useCallback(() => {
    setError(null);
    Promise.all([api.EnumL3Switch(), api.EnumHub()])
      .then(([sw, hubList]) => {
        setSwitches(sw.L3SWList ?? []);
        setHubs((hubList.HubList ?? []).map((h) => h.HubName_str));
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Reload the detail whenever a switch is selected or the list refreshes.
  React.useEffect(() => {
    if (selected !== null) {
      loadDetail(selected);
    }
  }, [selected, loadDetail]);

  const run = (promise: Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    promise
      .then(() => {
        setBusy(false);
        load();
        after?.();
        if (selected !== null) {
          loadDetail(selected, true);
        }
      })
      .catch((e) => {
        setError(String(e));
        setBusy(false);
      });
  };

  const selectedItem = switches?.find((s) => s.Name_str === selected) ?? null;
  const selectedActive = !!selectedItem?.Active_bool;

  const createSwitch = () => {
    const name = newName.trim();
    setCreateOpen(false);
    setNewName('');
    run(api.AddL3Switch(new VPN.VpnRpcL3Sw({ Name_str: name })), () => setSelected(name));
  };

  const openAddIf = () => {
    setIfHub(hubs[0] ?? '');
    setIfIp('');
    setIfMask('');
    setIfOpen(true);
  };
  const addIf = () => {
    if (!ifCanCreate) {
      return;
    }
    setIfOpen(false);
    run(
      api.AddL3If(
        new VPN.VpnRpcL3If({
          Name_str: selected ?? '',
          HubName_str: ifHub,
          IpAddress_ip: ifIp,
          SubnetMask_ip: ifMask,
        }),
      ),
    );
  };

  const openAddRoute = () => {
    setRNet('');
    setRMask('');
    setRGw('');
    setRMetric('1');
    setRouteOpen(true);
  };
  const addRoute = () => {
    if (!routeCanCreate || routeMetric === null) {
      return;
    }
    setRouteOpen(false);
    run(
      api.AddL3Table(
        new VPN.VpnRpcL3Table({
          Name_str: selected ?? '',
          NetworkAddress_ip: rNet,
          SubnetMask_ip: rMask,
          GatewayAddress_ip: rGw,
          Metric_u32: routeMetric,
        }),
      ),
    );
  };

  const confirmDeleteSwitch = () => {
    const name = pendingSwitch;
    setPendingSwitch(null);
    if (name === null) {
      return;
    }
    if (selected === name) {
      setSelected(null);
    }
    run(api.DelL3Switch(new VPN.VpnRpcL3Sw({ Name_str: name })));
  };

  const confirmDeleteIf = () => {
    const target = pendingIf;
    setPendingIf(null);
    if (!target) {
      return;
    }
    run(api.DelL3If(new VPN.VpnRpcL3If({ Name_str: selected ?? '', HubName_str: target.HubName_str })));
  };

  const confirmDeleteRoute = () => {
    const target = pendingRoute;
    setPendingRoute(null);
    if (!target) {
      return;
    }
    run(
      api.DelL3Table(
        new VPN.VpnRpcL3Table({
          Name_str: selected ?? '',
          NetworkAddress_ip: target.NetworkAddress_ip,
          SubnetMask_ip: target.SubnetMask_ip,
          GatewayAddress_ip: target.GatewayAddress_ip,
          Metric_u32: target.Metric_u32,
        }),
      ),
    );
  };

  const isLoading = switches === null && error === null;

  const createButton = (
    <Button
      variant="primary"
      icon={<PlusCircleIcon />}
      onClick={() => {
        setNewName('');
        setCreateOpen(true);
      }}
      isDisabled={isLoading}
    >
      Create switch
    </Button>
  );

  const routeMetric = parseMetric(rMetric);
  const duplicateIf = (ifs ?? []).some((it) => it.HubName_str === ifHub);
  const duplicateRoute =
    routeMetric !== null &&
    (routes ?? []).some(
      (rt) =>
        rt.NetworkAddress_ip === rNet &&
        rt.SubnetMask_ip === rMask &&
        rt.GatewayAddress_ip === rGw &&
        rt.Metric_u32 === routeMetric,
    );
  const ifIpHelper = interfaceIpHelp(ifIp, ifMask);
  const ifMaskHelper = maskHelp(ifMask);
  const routeNetworkHelper = networkAddressHelp(rNet, rMask);
  const routeMaskHelper = maskHelp(rMask);
  const routeGatewayHelper = hostHelp(rGw);
  const routeMetricHelper = metricHelp(rMetric);
  const ifCanCreate = ifHub !== '' && isInterfaceAddress(ifIp, ifMask) && !duplicateIf;
  const routeCanCreate = isNetworkAddress(rNet, rMask) && isHostIPv4(rGw) && routeMetric !== null && !duplicateRoute;

  return (
    <AppPage
      title="Layer 3 Switch"
      description="Software Layer-3 switches route IP between Virtual Hubs. Stop a switch to change its interfaces or routing table, then start it."
      actions={createButton}
    >
      <Stack hasGutter>
        {error && (
          <StackItem>
            <Alert variant="danger" title="Layer 3 switch operation failed" isInline>
              {error}
            </Alert>
          </StackItem>
        )}

        <StackItem>
          {isLoading ? (
            <Bullseye>
              <Spinner size="xl" aria-label="Loading Layer 3 switches" />
            </Bullseye>
          ) : switches !== null && switches.length === 0 ? (
            <EmptyState titleText="No Layer 3 switches" headingLevel="h2">
              <EmptyStateBody>Create a switch, add interfaces and routes, then start it.</EmptyStateBody>
            </EmptyState>
          ) : switches !== null ? (
            <Table aria-label="Layer 3 switches" variant="compact">
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Interfaces</Th>
                  <Th>Routes</Th>
                  <Th>Status</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {switches.map((sw) => {
                  const active = !!sw.Active_bool;
                  const statusLabel = active ? (sw.Online_bool ? 'Operational' : 'Active (offline)') : 'Stopped';
                  const statusColor = active ? (sw.Online_bool ? 'green' : 'orange') : 'grey';
                  return (
                    <Tr key={sw.Name_str} isRowSelected={sw.Name_str === selected}>
                      <Td dataLabel="Name">
                        <Button variant="link" isInline onClick={() => setSelected(sw.Name_str)}>
                          {sw.Name_str}
                        </Button>
                      </Td>
                      <Td dataLabel="Interfaces">{sw.NumInterfaces_u32}</Td>
                      <Td dataLabel="Routes">{sw.NumTables_u32}</Td>
                      <Td dataLabel="Status">
                        <Label color={statusColor} isCompact>
                          {statusLabel}
                        </Label>
                      </Td>
                      <Td isActionCell>
                        <ActionsColumn
                          items={[
                            active
                              ? { title: 'Stop', onClick: () => run(api.StopL3Switch(new VPN.VpnRpcL3Sw({ Name_str: sw.Name_str }))) }
                              : { title: 'Start', onClick: () => run(api.StartL3Switch(new VPN.VpnRpcL3Sw({ Name_str: sw.Name_str }))) },
                            { title: 'Manage', onClick: () => setSelected(sw.Name_str) },
                            { isSeparator: true },
                            { title: 'Delete', onClick: () => setPendingSwitch(sw.Name_str) },
                          ]}
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

        {selectedItem && (
          <StackItem>
            <Card>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>Switch: {selectedItem.Name_str}</FlexItem>
                  <FlexItem>
                    <Button variant="link" isInline onClick={() => setSelected(null)}>
                      Close
                    </Button>
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                {selectedActive && (
                  <Alert
                    variant="info"
                    title="Stop the switch to change its interfaces and routing table"
                    isInline
                    style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
                  />
                )}
                <Stack hasGutter>
                  {/* Virtual interfaces */}
                  <StackItem>
                    <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                      <FlexItem>
                        <Content component="h3">Virtual interfaces</Content>
                      </FlexItem>
                      <FlexItem>
                        <Button
                          variant="secondary"
                          icon={<PlusCircleIcon />}
                          onClick={openAddIf}
                          isDisabled={busy || selectedActive || hubs.length === 0 || ifs === null}
                        >
                          Add interface
                        </Button>
                      </FlexItem>
                    </Flex>
                    {ifs === null ? (
                      <Bullseye>
                        <Spinner size="lg" aria-label="Loading interfaces" />
                      </Bullseye>
                    ) : ifs.length === 0 ? (
                      <Content component="small">No interfaces defined.</Content>
                    ) : (
                      <Table aria-label="Virtual interfaces" variant="compact">
                        <Thead>
                          <Tr>
                            <Th>Virtual Hub</Th>
                            <Th>IP address</Th>
                            <Th>Subnet mask</Th>
                            <Th screenReaderText="Actions" />
                          </Tr>
                        </Thead>
                        <Tbody>
                          {ifs.map((it) => (
                            <Tr key={`${it.HubName_str}/${it.IpAddress_ip}`}>
                              <Td dataLabel="Virtual Hub">{it.HubName_str}</Td>
                              <Td dataLabel="IP address">{it.IpAddress_ip}</Td>
                              <Td dataLabel="Subnet mask">{it.SubnetMask_ip}</Td>
                              <Td isActionCell>
                                <ActionsColumn
                                  items={[{ title: 'Delete', onClick: () => setPendingIf(it) }]}
                                  isDisabled={busy || selectedActive}
                                />
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    )}
                  </StackItem>

                  {/* Routing table */}
                  <StackItem>
                    <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                      <FlexItem>
                        <Content component="h3">Routing table</Content>
                      </FlexItem>
                      <FlexItem>
                        <Button
                          variant="secondary"
                          icon={<PlusCircleIcon />}
                          onClick={openAddRoute}
                          isDisabled={busy || selectedActive || routes === null}
                        >
                          Add route
                        </Button>
                      </FlexItem>
                    </Flex>
                    {routes === null ? (
                      <Bullseye>
                        <Spinner size="lg" aria-label="Loading routing table" />
                      </Bullseye>
                    ) : routes.length === 0 ? (
                      <Content component="small">No routes defined.</Content>
                    ) : (
                      <Table aria-label="Routing table" variant="compact">
                        <Thead>
                          <Tr>
                            <Th>Network address</Th>
                            <Th>Subnet mask</Th>
                            <Th>Gateway</Th>
                            <Th>Metric</Th>
                            <Th screenReaderText="Actions" />
                          </Tr>
                        </Thead>
                        <Tbody>
                          {routes.map((rt) => (
                            <Tr key={`${rt.NetworkAddress_ip}/${rt.SubnetMask_ip}/${rt.GatewayAddress_ip}`}>
                              <Td dataLabel="Network address">{rt.NetworkAddress_ip}</Td>
                              <Td dataLabel="Subnet mask">{rt.SubnetMask_ip}</Td>
                              <Td dataLabel="Gateway">{rt.GatewayAddress_ip}</Td>
                              <Td dataLabel="Metric">{rt.Metric_u32}</Td>
                              <Td isActionCell>
                                <ActionsColumn
                                  items={[{ title: 'Delete', onClick: () => setPendingRoute(rt) }]}
                                  isDisabled={busy || selectedActive}
                                />
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    )}
                  </StackItem>
                </Stack>
              </CardBody>
            </Card>
          </StackItem>
        )}
      </Stack>

      {/* Create switch */}
      <Modal variant={ModalVariant.small} isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <ModalHeader title="Create Layer 3 switch" />
        <ModalBody>
          <Form>
            <FormGroup label="Switch name" fieldId="l3-name">
              <TextInput
                id="l3-name"
                value={newName}
                onChange={(_event, value) => setNewName(value)}
                aria-label="Switch name"
              />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={createSwitch} isDisabled={newName.trim() === ''}>
            Create
          </Button>
          <Button variant="link" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Add interface */}
      <Modal variant={ModalVariant.small} isOpen={ifOpen} onClose={() => setIfOpen(false)}>
        <ModalHeader title="Add virtual interface" />
        <ModalBody>
          <Form>
            <FormGroup label="Virtual Hub" fieldId="l3-if-hub">
              <FormSelect id="l3-if-hub" value={ifHub} onChange={(_event, value) => setIfHub(value)} aria-label="Virtual Hub">
                {hubs.map((h) => (
                  <FormSelectOption key={h} value={h} label={h} />
                ))}
              </FormSelect>
            </FormGroup>
            <FormGroup label="IP address" fieldId="l3-if-ip">
              <TextInput
                id="l3-if-ip"
                value={ifIp}
                onChange={(_event, value) => setIfIp(value)}
                validated={interfaceIpValidated(ifIp, ifMask)}
                aria-label="IP address"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={ifIpHelper.variant}>{ifIpHelper.text}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label="Subnet mask" fieldId="l3-if-mask">
              <TextInput
                id="l3-if-mask"
                value={ifMask}
                onChange={(_event, value) => setIfMask(value)}
                validated={subnetMaskValidated(ifMask)}
                aria-label="Subnet mask"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={ifMaskHelper.variant}>{ifMaskHelper.text}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            {duplicateIf && (
              <Alert variant="warning" title="This switch already has an interface for the selected hub." isInline />
            )}
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={addIf} isDisabled={!ifCanCreate}>
            Add
          </Button>
          <Button variant="link" onClick={() => setIfOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Add route */}
      <Modal variant={ModalVariant.small} isOpen={routeOpen} onClose={() => setRouteOpen(false)}>
        <ModalHeader title="Add routing table entry" />
        <ModalBody>
          <Form>
            <FormGroup label="Network address" fieldId="l3-r-net">
              <TextInput
                id="l3-r-net"
                value={rNet}
                onChange={(_event, value) => setRNet(value)}
                validated={networkAddressValidated(rNet, rMask)}
                aria-label="Network address"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={routeNetworkHelper.variant}>{routeNetworkHelper.text}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label="Subnet mask" fieldId="l3-r-mask">
              <TextInput
                id="l3-r-mask"
                value={rMask}
                onChange={(_event, value) => setRMask(value)}
                validated={subnetMaskValidated(rMask)}
                aria-label="Subnet mask"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={routeMaskHelper.variant}>{routeMaskHelper.text}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label="Gateway address" fieldId="l3-r-gw">
              <TextInput
                id="l3-r-gw"
                value={rGw}
                onChange={(_event, value) => setRGw(value)}
                validated={hostIpValidated(rGw)}
                aria-label="Gateway address"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={routeGatewayHelper.variant}>{routeGatewayHelper.text}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            <FormGroup label="Metric" fieldId="l3-r-metric">
              <TextInput
                type="number"
                id="l3-r-metric"
                min={1}
                value={rMetric}
                onChange={(_event, value) => setRMetric(value)}
                validated={metricValidated(rMetric)}
                aria-label="Metric"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={routeMetricHelper.variant}>{routeMetricHelper.text}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
            {duplicateRoute && <Alert variant="warning" title="This routing table entry already exists." isInline />}
          </Form>
          <Content component="small">
            For the default gateway, set both the network address and subnet mask to 0.0.0.0.
          </Content>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={addRoute} isDisabled={!routeCanCreate}>
            Add
          </Button>
          <Button variant="link" onClick={() => setRouteOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete confirmations */}
      <Modal variant={ModalVariant.small} isOpen={pendingSwitch !== null} onClose={() => setPendingSwitch(null)}>
        <ModalHeader title="Delete Layer 3 switch" titleIconVariant="warning" />
        <ModalBody>
          Delete the switch <strong>{pendingSwitch}</strong>? Its interfaces and routing table are removed.
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDeleteSwitch}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingSwitch(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <Modal variant={ModalVariant.small} isOpen={pendingIf !== null} onClose={() => setPendingIf(null)}>
        <ModalHeader title="Delete interface" titleIconVariant="warning" />
        <ModalBody>
          Delete the interface on <strong>{pendingIf?.HubName_str}</strong> ({pendingIf?.IpAddress_ip})?
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDeleteIf}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingIf(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <Modal variant={ModalVariant.small} isOpen={pendingRoute !== null} onClose={() => setPendingRoute(null)}>
        <ModalHeader title="Delete route" titleIconVariant="warning" />
        <ModalBody>
          Delete the route to <strong>{pendingRoute?.NetworkAddress_ip}</strong>?
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDeleteRoute}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingRoute(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  );
};

export { Layer3Switch };
