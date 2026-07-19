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
  Pagination,
  PaginationVariant,
  Spinner,
  Switch,
  Tab,
  TabTitleText,
  Tabs,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { useServer } from '@app/ServerContext';
import { binToBytes, downloadBlob } from '@app/utils/blob_utils';
import { capBool } from '@app/utils/caps';
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

const PREVIEW_MAX_BYTES = 128 * 1024;
const logFilePageSizes = [
  { title: '10', value: 10 },
  { title: '25', value: 25 },
  { title: '50', value: 50 },
];

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

interface LogReadOptions {
  maxBytes?: number;
  startOffset?: number;
  endOffset?: number;
}

const logFileSize = (file: VPN.VpnRpcEnumLogFileItem): number | null => {
  const size = Number(file.FileSize_u32);
  return Number.isFinite(size) && size > 0 ? size : null;
};

const readLogFile = async (
  file: VPN.VpnRpcEnumLogFileItem,
  onChunk: LogReadChunkHandler,
  options: LogReadOptions = {},
): Promise<{ truncated: boolean; totalBytes: number }> => {
  let offset = Math.max(0, Math.floor(options.startOffset ?? 0));
  let totalBytes = 0;
  let truncated = false;
  let done = false;
  const { maxBytes, endOffset } = options;

  while (!done) {
    if (endOffset !== undefined && offset >= endOffset) {
      done = true;
      break;
    }
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
    } else {
      const remainingToEnd = endOffset === undefined ? bytes.length : Math.max(0, endOffset - offset);
      const chunk = bytes.slice(0, remainingToEnd);
      if (chunk.length === 0) {
        done = true;
        break;
      }
      if (maxBytes !== undefined && totalBytes + chunk.length > maxBytes) {
      const remaining = maxBytes - totalBytes;
      if (remaining > 0) {
          onChunk(chunk.slice(0, remaining));
        totalBytes += remaining;
      }
      truncated = true;
      done = true;
    } else {
        onChunk(chunk);
        totalBytes += chunk.length;
        offset += chunk.length;
        if (maxBytes !== undefined && totalBytes >= maxBytes && (endOffset === undefined || offset < endOffset)) {
          truncated = true;
          done = true;
        }
        if (endOffset !== undefined && offset >= endOffset) {
          done = true;
        }
      // Offset_u32 cannot address past 4 GiB; stop instead of wrapping and
      // re-reading the file from the start.
      if (offset > 0xffffffff) {
        truncated = true;
        done = true;
      }
      }
    }
  }

  return { truncated, totalBytes };
};

const readLogFileText = async (
  file: VPN.VpnRpcEnumLogFileItem,
): Promise<{ text: string; truncated: boolean; totalBytes: number; startOffset: number; fileSize: number | null }> => {
  const decoder = new TextDecoder('utf-8');
  let chunks = '';
  const fileSize = logFileSize(file);
  const isTailPreview = fileSize !== null && fileSize > PREVIEW_MAX_BYTES;
  const startOffset = isTailPreview ? fileSize - PREVIEW_MAX_BYTES : 0;

  const result = await readLogFile(file, (chunk) => {
    chunks += decoder.decode(chunk, { stream: true });
  }, { maxBytes: PREVIEW_MAX_BYTES, startOffset, endOffset: isTailPreview ? fileSize : undefined });

  chunks += decoder.decode();

  return { text: chunks, truncated: result.truncated || startOffset > 0, totalBytes: result.totalBytes, startOffset, fileSize };
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
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(25);
  const [preview, setPreview] = React.useState<{
    file: VPN.VpnRpcEnumLogFileItem;
    isLoading: boolean;
    scrollToBottom: boolean;
    text: string;
  } | null>(null);
  const previewTextRef = React.useRef<HTMLPreElement | null>(null);
  const previewRequestRef = React.useRef(0);
  const downloadRequestRef = React.useRef(0);

  const load = React.useCallback(async (): Promise<VPN.VpnRpcEnumLogFileItem[] | null> => {
    if (!supported) {
      setFiles([]);
      setError(null);
      return [];
    }
    setError(null);
    try {
      const response = await api.EnumLogFile();
      const nextFiles = [...(response.LogFiles ?? [])].reverse();
      setFiles(nextFiles);
      return nextFiles;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [supported]);

  React.useEffect(() => {
    load();
  }, [load]);

  const visibleFiles = React.useMemo(() => {
    if (files === null) {
      return null;
    }
    const start = (page - 1) * perPage;
    return files.slice(start, start + perPage);
  }, [files, page, perPage]);
  const pageCount = files === null ? 1 : Math.max(1, Math.ceil(files.length / perPage));

  React.useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  React.useEffect(() => {
    if (!preview?.isLoading && preview?.scrollToBottom && previewTextRef.current) {
      window.requestAnimationFrame(() => {
        if (previewTextRef.current) {
          previewTextRef.current.scrollTop = previewTextRef.current.scrollHeight;
        }
      });
    }
  }, [preview]);

  const openPreview = (file: VPN.VpnRpcEnumLogFileItem) => {
    setActiveFile(file);
    setDownloading(file.FilePath_str);
    setError(null);
    const requestId = ++previewRequestRef.current;
    setPreview({ file, isLoading: true, scrollToBottom: false, text: '' });
    window.setTimeout(async () => {
      try {
        const refreshedFiles = await load();
        if (requestId !== previewRequestRef.current) {
          return;
        }
        const previewFile =
          refreshedFiles?.find(
            (candidate) =>
              candidate.ServerName_str === file.ServerName_str && candidate.FilePath_str === file.FilePath_str,
          ) ?? file;
        setPreview({ file: previewFile, isLoading: true, scrollToBottom: false, text: '' });
        const result = await readLogFileText(previewFile);
        if (requestId !== previewRequestRef.current) {
          return;
        }
        let notice = '';
        if (result.fileSize !== null) {
          if (result.startOffset > 0) {
            notice = `\n\n[Preview: showing the last ${result.totalBytes} of ${result.fileSize} bytes.]`;
          } else if (result.truncated) {
            notice = `\n\n[Preview: showing the first ${result.totalBytes} bytes.]`;
          } else {
            notice = `\n\n[Preview: showing ${result.totalBytes} of ${result.fileSize} bytes.]`;
          }
        } else if (result.truncated) {
          notice = `\n\n[Preview: showing the first ${result.totalBytes} bytes.]`;
        } else {
          notice = `\n\n[Preview: showing ${result.totalBytes} bytes.]`;
        }
        setPreview({
          file: previewFile,
          isLoading: false,
          scrollToBottom: true,
          text: result.text + notice,
        });
      } catch (e) {
        if (requestId === previewRequestRef.current) {
          setPreview(null);
          setError(String(e));
        }
      } finally {
        if (requestId === previewRequestRef.current) {
          setDownloading(null);
          setActiveFile(null);
        }
      }
    }, 0);
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

  const closePreview = () => {
    if (preview?.isLoading) {
      previewRequestRef.current += 1;
      setDownloading(null);
      setActiveFile(null);
    }
    setPreview(null);
    load();
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
      ) : files !== null && visibleFiles !== null ? (
        <>
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            gap={{ default: 'gapSm' }}
            justifyContent={{ default: 'justifyContentSpaceBetween' }}
          >
            <FlexItem>
              <Pagination
                itemCount={files.length}
                page={page}
                perPage={perPage}
                perPageOptions={logFilePageSizes}
                variant={PaginationVariant.top}
                onSetPage={(_event, nextPage) => setPage(nextPage)}
                onPerPageSelect={(_event, nextPerPage, nextPage) => {
                  setPerPage(nextPerPage);
                  setPage(nextPage);
                }}
                titles={{ items: 'log files', perPageSuffix: 'log files' }}
              />
            </FlexItem>
            <FlexItem>
              <FormSelect
                id="log-files-page"
                value={page}
                onChange={(_event, value) => setPage(Number(value))}
                aria-label="Log files page"
              >
                {Array.from({ length: pageCount }, (_value, index) => (
                  <FormSelectOption key={index + 1} value={index + 1} label={`Page ${index + 1}`} />
                ))}
              </FormSelect>
            </FlexItem>
          </Flex>
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
              {visibleFiles.map((file) => (
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
                          title: 'View',
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
        </>
      ) : null}

      <Modal variant={ModalVariant.large} isOpen={preview !== null} onClose={closePreview}>
        <ModalHeader title={preview ? `Log file: ${preview.file.FilePath_str}` : 'Log file'} />
        <ModalBody>
          {preview?.isLoading ? (
            <Bullseye>
              <Spinner size="xl" aria-label="Loading log preview" />
            </Bullseye>
          ) : (
            <pre
              ref={previewTextRef}
              style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}
            >
              {preview?.text ?? ''}
            </pre>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => preview && downloadFile(preview.file)}
            isDisabled={preview?.isLoading || downloading !== null}
          >
            Download
          </Button>
          <Button variant="link" onClick={closePreview}>
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
      aria-label="Hub log views"
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
