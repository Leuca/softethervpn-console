import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  Switch,
  Tab,
  TabTitleText,
  Tabs,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { useServer } from '@app/ServerContext';
import { binToBytes, downloadBlob } from '@app/utils/blob_utils';
import { formatRpcValue } from '@app/utils/format';

const logSwitchOptions = [
  { value: VPN.VpnRpcLogSwitchType.No, label: 'Do not switch' },
  { value: VPN.VpnRpcLogSwitchType.Second, label: 'Every second' },
  { value: VPN.VpnRpcLogSwitchType.Minute, label: 'Every minute' },
  { value: VPN.VpnRpcLogSwitchType.Hour, label: 'Every hour' },
  { value: VPN.VpnRpcLogSwitchType.Day, label: 'Every day' },
  { value: VPN.VpnRpcLogSwitchType.Month, label: 'Every month' },
];

const packetLogOptions = [
  { value: VPN.VpnRpcPacketLogSetting.None, label: 'None' },
  { value: VPN.VpnRpcPacketLogSetting.Header, label: 'Headers only' },
  { value: VPN.VpnRpcPacketLogSetting.All, label: 'Headers and data' },
];

const packetTypes = [
  'TCP connection log',
  'TCP packet log',
  'DHCP packet log',
  'UDP packet log',
  'ICMP packet log',
  'IP packet log',
  'ARP packet log',
  'Ethernet packet log',
];

const PREVIEW_MAX_BYTES = 1_000_000;

const capValue = (capsList: unknown[], name: string): number | null => {
  const cap = capsList.find((item) => (item as VPN.VpnCaps).CapsName_str === name) as VPN.VpnCaps | undefined;
  return cap ? cap.CapsValue_u32 : null;
};

const capBool = (capsList: unknown[], name: string): boolean => capValue(capsList, name) !== 0;

const normalizeLogSettings = (response: VPN.VpnRpcHubLog): VPN.VpnRpcHubLog => {
  const config = new VPN.VpnRpcHubLog(response);
  config.PacketLogConfig_u32 = Array.from({ length: packetTypes.length }, (_value, index) => {
    const setting = config.PacketLogConfig_u32?.[index];
    return setting === undefined ? VPN.VpnRpcPacketLogSetting.None : setting;
  });
  return config;
};

const safeLogFileName = (file: VPN.VpnRpcEnumLogFileItem): string =>
  `${file.ServerName_str || 'server'}_${file.FilePath_str || 'log.txt'}`.replace(/[^A-Za-z0-9_.-]+/g, '_');

type LogReadChunkHandler = (chunk: Uint8Array) => void;

const readLogFile = async (
  file: VPN.VpnRpcEnumLogFileItem,
  onChunk: LogReadChunkHandler,
  maxBytes?: number,
): Promise<{ truncated: boolean; totalBytes: number }> => {
  let offset = 0;
  let totalBytes = 0;
  let truncated = false;
  let done = false;

  while (!done) {
    const response = await api.ReadLogFile(
      new VPN.VpnRpcReadLogFile({
        ServerName_str: file.ServerName_str,
        FilePath_str: file.FilePath_str,
        Offset_u32: offset,
      }),
    );
    const bytes = binToBytes(response.Buffer_bin);
    if (!bytes || bytes.length === 0) {
      done = true;
    } else if (maxBytes !== undefined && totalBytes + bytes.length > maxBytes) {
      const remaining = maxBytes - totalBytes;
      if (remaining > 0) {
        onChunk(bytes.slice(0, remaining));
        totalBytes += remaining;
      }
      truncated = true;
      done = true;
    } else {
      onChunk(bytes);
      totalBytes += bytes.length;
      offset += bytes.length;
    }
  }

  return { truncated, totalBytes };
};

const readLogFileText = async (
  file: VPN.VpnRpcEnumLogFileItem,
): Promise<{ text: string; truncated: boolean; totalBytes: number }> => {
  const decoder = new TextDecoder('utf-8');
  let chunks = '';
  let truncated = false;

  const result = await readLogFile(file, (chunk) => {
    chunks += decoder.decode(chunk, { stream: true });
  }, PREVIEW_MAX_BYTES);

  chunks += decoder.decode();
  truncated = result.truncated;

  return { text: chunks, truncated, totalBytes: result.totalBytes };
};

const readLogFileBlob = async (file: VPN.VpnRpcEnumLogFileItem): Promise<Blob> => {
  const chunks: BlobPart[] = [];
  await readLogFile(file, (chunk) => {
    chunks.push(chunk);
  });
  return new Blob(chunks, { type: 'text/plain' });
};

const HubLogSettings: React.FunctionComponent<{ hub: string; supported: boolean }> = ({ hub, supported }) => {
  const [config, setConfig] = React.useState<VPN.VpnRpcHubLog | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    if (!supported) {
      setConfig(null);
      setError(null);
      return;
    }
    setConfig(null);
    setError(null);
    api
      .GetHubLog(new VPN.VpnRpcHubLog({ HubName_str: hub }))
      .then((response) => setConfig(normalizeLogSettings(response)))
      .catch((e) => setError(String(e)));
  }, [hub, supported]);

  React.useEffect(() => {
    load();
  }, [load]);

  const setField = (key: keyof VPN.VpnRpcHubLog, value: unknown) =>
    setConfig((prev) => (prev ? new VPN.VpnRpcHubLog({ ...prev, [key]: value }) : prev));

  const setPacketLogConfig = (index: number, value: number) =>
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const nextConfig = [...prev.PacketLogConfig_u32];
      nextConfig[index] = value;
      return new VPN.VpnRpcHubLog({ ...prev, PacketLogConfig_u32: nextConfig });
    });

  const save = () => {
    if (!config) {
      return;
    }
    setSaving(true);
    setError(null);
    const payload = new VPN.VpnRpcHubLog(config);
    payload.HubName_str = hub;
    api
      .SetHubLog(payload)
      .then(() => {
        setSaving(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setSaving(false);
      });
  };

  const isLoading = supported && config === null && error === null;

  if (!supported) {
    return (
      <Alert variant="info" title="Log settings are not supported by this server" isInline>
        This server does not advertise hub log configuration support.
      </Alert>
    );
  }

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading || saving}>
            Refresh
          </Button>
        </FlexItem>
        <FlexItem>
          <Button variant="primary" onClick={save} isDisabled={config === null || saving} isLoading={saving}>
            Save
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="Could not load or save log settings" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading log settings" />
        </Bullseye>
      ) : config !== null ? (
        <Form style={{ maxWidth: '48rem' }}>
          <FormGroup fieldId="security-log-enabled">
            <Switch
              id="security-log-enabled"
              label="Save security log"
              isChecked={config.SaveSecurityLog_bool}
              onChange={(_event, checked) => setField('SaveSecurityLog_bool', checked)}
            />
          </FormGroup>
          <FormGroup label="Security log file switch cycle" fieldId="security-log-switch">
            <FormSelect
              id="security-log-switch"
              value={config.SecurityLogSwitchType_u32}
              onChange={(_event, value) => setField('SecurityLogSwitchType_u32', Number(value))}
              isDisabled={!config.SaveSecurityLog_bool}
              aria-label="Security log file switch cycle"
            >
              {logSwitchOptions.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup fieldId="packet-log-enabled">
            <Switch
              id="packet-log-enabled"
              label="Save packet logs"
              isChecked={config.SavePacketLog_bool}
              onChange={(_event, checked) => setField('SavePacketLog_bool', checked)}
            />
          </FormGroup>
          <FormGroup label="Packet log file switch cycle" fieldId="packet-log-switch">
            <FormSelect
              id="packet-log-switch"
              value={config.PacketLogSwitchType_u32}
              onChange={(_event, value) => setField('PacketLogSwitchType_u32', Number(value))}
              isDisabled={!config.SavePacketLog_bool}
              aria-label="Packet log file switch cycle"
            >
              {logSwitchOptions.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
          </FormGroup>

          {packetTypes.map((label, index) => (
            <FormGroup key={label} label={label} fieldId={`packet-log-${index}`}>
              <FormSelect
                id={`packet-log-${index}`}
                value={config.PacketLogConfig_u32[index]}
                onChange={(_event, value) => setPacketLogConfig(index, Number(value))}
                isDisabled={!config.SavePacketLog_bool}
                aria-label={label}
              >
                {packetLogOptions.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
            </FormGroup>
          ))}
        </Form>
      ) : null}
    </Flex>
  );
};

const HubLogFiles: React.FunctionComponent<{ supported: boolean }> = ({ supported }) => {
  const [files, setFiles] = React.useState<VPN.VpnRpcEnumLogFileItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [activeFile, setActiveFile] = React.useState<VPN.VpnRpcEnumLogFileItem | null>(null);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{ file: VPN.VpnRpcEnumLogFileItem; text: string } | null>(null);
  const previewRequestRef = React.useRef(0);
  const downloadRequestRef = React.useRef(0);

  const load = React.useCallback(() => {
    if (!supported) {
      setFiles([]);
      setError(null);
      return;
    }
    setFiles(null);
    setError(null);
    api
      .EnumLogFile()
      .then((response) => setFiles(response.LogFiles ?? []))
      .catch((e) => setError(String(e)));
  }, [supported]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openPreview = (file: VPN.VpnRpcEnumLogFileItem) => {
    setActiveFile(file);
    setDownloading(file.FilePath_str);
    setPreview(null);
    setError(null);
    const requestId = ++previewRequestRef.current;
    readLogFileText(file)
      .then((result) => {
        if (requestId === previewRequestRef.current) {
          setPreview({
            file,
            text: result.text + (result.truncated ? '\n\n[Preview truncated due to size.]' : ''),
          });
        }
      })
      .catch((e) => {
        if (requestId === previewRequestRef.current) {
          setError(String(e));
        }
      })
      .finally(() => {
        if (requestId === previewRequestRef.current) {
          setDownloading(null);
          setActiveFile(null);
        }
      });
  };

  const downloadFile = (file: VPN.VpnRpcEnumLogFileItem) => {
    setDownloading(file.FilePath_str);
    setError(null);
    const requestId = ++downloadRequestRef.current;
    readLogFileBlob(file)
      .then((blob) => {
        if (requestId === downloadRequestRef.current) {
          downloadBlob(blob, safeLogFileName(file));
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (requestId === downloadRequestRef.current) {
          setDownloading(null);
        }
      });
  };

  const isLoading = supported && files === null && error === null;

  if (!supported) {
    return (
      <Alert variant="info" title="Log file browsing is not supported by this server" isInline>
        This server does not advertise log file read support.
      </Alert>
    );
  }

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }}>
        <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading}>
          Refresh
        </Button>
      </Flex>

      {error && (
        <Alert variant="danger" title="Log file operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading log files" />
        </Bullseye>
      ) : files !== null && files.length === 0 ? (
        <EmptyState titleText="No log files" headingLevel="h2">
          <EmptyStateBody>No readable log files were returned by the server.</EmptyStateBody>
        </EmptyState>
      ) : files !== null ? (
        <Table aria-label="Log files" variant="compact" gridBreakPoint="grid-md">
          <Thead>
            <Tr>
              <Th modifier="truncate" width={50}>
                File path
              </Th>
              <Th>Size</Th>
              <Th>Updated</Th>
              <Th>Server</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {files.map((file) => (
              <Tr key={`${file.ServerName_str}:${file.FilePath_str}`}>
                <Td dataLabel="File path" modifier="truncate" tooltip={file.FilePath_str}>
                  {file.FilePath_str}
                </Td>
                <Td dataLabel="Size">{formatRpcValue('FileSize_u32', file.FileSize_u32)} bytes</Td>
                <Td dataLabel="Updated">{formatRpcValue('UpdatedTime_dt', file.UpdatedTime_dt)}</Td>
                <Td dataLabel="Server">{file.ServerName_str || '-'}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    isDisabled={downloading !== null}
                    items={[
                      {
                        title: activeFile?.FilePath_str === file.FilePath_str ? 'Loading preview' : 'View',
                        onClick: () => openPreview(file),
                        isDisabled: downloading !== null,
                      },
                      {
                        title: downloading === file.FilePath_str && activeFile === null ? 'Downloading' : 'Download',
                        onClick: () => downloadFile(file),
                        isDisabled: downloading !== null,
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}

      <Modal variant={ModalVariant.large} isOpen={preview !== null} onClose={() => setPreview(null)}>
        <ModalHeader title={preview ? `Log file: ${preview.file.FilePath_str}` : 'Log file'} />
        <ModalBody>
          <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {preview?.text ?? ''}
          </pre>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={() => preview && downloadFile(preview.file)}>
            Download
          </Button>
          <Button variant="link" onClick={() => setPreview(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </Flex>
  );
};

const HubLogs: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [activeTab, setActiveTab] = React.useState<string>('settings');
  const { capsList } = useServer();
  const settingsSupported = capBool(capsList, 'b_support_config_log');
  const filesSupported = capBool(capsList, 'b_support_read_log');

  return (
    <Tabs
      activeKey={activeTab}
      onSelect={(_event, key) => setActiveTab(String(key))}
      mountOnEnter
      unmountOnExit
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Tab eventKey="settings" title={<TabTitleText>Settings</TabTitleText>}>
        <div style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}>
          <HubLogSettings hub={hub} supported={settingsSupported} />
        </div>
      </Tab>
      <Tab eventKey="files" title={<TabTitleText>Files</TabTitleText>}>
        <div style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}>
          <HubLogFiles supported={filesSupported} />
        </div>
      </Tab>
    </Tabs>
  );
};

export { HubLogs };
