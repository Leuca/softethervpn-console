import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubLogs } from './HubLogs';
import { api } from '@app/utils/vpnrpc_settings';
import { downloadBlob } from '@app/utils/blob_utils';

const serverState = {
  capsList: [
    { CapsName_str: 'b_support_config_log', CapsValue_u32: 1 },
    { CapsName_str: 'b_support_read_log', CapsValue_u32: 1 },
  ] as unknown[],
};

vi.mock('@app/ServerContext', () => ({
  useServer: () => serverState,
}));

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetHubLog: vi.fn(),
    SetHubLog: vi.fn(),
    EnumLogFile: vi.fn(),
    ReadLogFile: vi.fn(),
  },
}));

vi.mock('@app/utils/blob_utils', async () => {
  const actual = await vi.importActual<typeof import('@app/utils/blob_utils')>('@app/utils/blob_utils');
  return { ...actual, downloadBlob: vi.fn() };
});

const getHubLog = api.GetHubLog as unknown as Mock;
const setHubLog = api.SetHubLog as unknown as Mock;
const enumLogFile = api.EnumLogFile as unknown as Mock;
const readLogFile = api.ReadLogFile as unknown as Mock;
const download = downloadBlob as unknown as Mock;

const logConfig = {
  HubName_str: 'DEFAULT',
  SaveSecurityLog_bool: true,
  SecurityLogSwitchType_u32: 4,
  SavePacketLog_bool: true,
  PacketLogSwitchType_u32: 3,
  PacketLogConfig_u32: [0, 1, 2, 0, 1, 2, 0, 1],
};

const logFile = {
  ServerName_str: 'vpn1',
  FilePath_str: '@security_log/DEFAULT/20260706.log',
  FileSize_u32: 18,
  UpdatedTime_dt: '2026-07-06T10:00:00.000Z',
};

const b64 = (value: string): string => btoa(value);

describe('HubLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverState.capsList = [
      { CapsName_str: 'b_support_config_log', CapsValue_u32: 1 },
      { CapsName_str: 'b_support_read_log', CapsValue_u32: 1 },
    ];
  });

  it('loads and saves hub log settings', async () => {
    getHubLog.mockResolvedValue({ ...logConfig });
    setHubLog.mockResolvedValue({});
    const user = userEvent.setup();

    render(<HubLogs hub="DEFAULT" />);

    expect(await screen.findByLabelText('Security log file switch cycle')).toHaveValue('4');
    expect(getHubLog.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });

    await user.selectOptions(screen.getByLabelText('Security log file switch cycle'), '5');
    await user.selectOptions(screen.getByLabelText('TCP packet log'), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setHubLog.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.SecurityLogSwitchType_u32).toBe(5);
    expect(sent.PacketLogConfig_u32[1]).toBe(2);
  });

  it('disables packet log selectors when packet logging is off', async () => {
    getHubLog.mockResolvedValue({ ...logConfig, SavePacketLog_bool: false });

    render(<HubLogs hub="DEFAULT" />);

    expect(await screen.findByLabelText('Packet log file switch cycle')).toBeDisabled();
    expect(screen.getByLabelText('TCP packet log')).toBeDisabled();
  });

  it('lists log files and previews a file downloaded in chunks', async () => {
    getHubLog.mockResolvedValue({ ...logConfig });
    enumLogFile.mockResolvedValue({ LogFiles: [logFile] });
    readLogFile
      .mockResolvedValueOnce({ Buffer_bin: b64('first line\n') })
      .mockResolvedValueOnce({ Buffer_bin: b64('second line\n') })
      .mockResolvedValueOnce({ Buffer_bin: '' });
    const user = userEvent.setup();

    render(<HubLogs hub="DEFAULT" />);
    await user.click(screen.getByRole('tab', { name: 'Files' }));

    expect(await screen.findByText('@security_log/DEFAULT/20260706.log')).toBeInTheDocument();
    const row = screen.getByText('@security_log/DEFAULT/20260706.log').closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'View' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/first line/)).toBeInTheDocument();
    expect(within(dialog).getByText(/second line/)).toBeInTheDocument();
    expect(readLogFile.mock.calls[0][0]).toMatchObject({
      ServerName_str: 'vpn1',
      FilePath_str: '@security_log/DEFAULT/20260706.log',
      Offset_u32: 0,
    });
    expect(readLogFile.mock.calls[1][0]).toMatchObject({ Offset_u32: 11 });
  });

  it('shows newest log files first by reversing the server order', async () => {
    getHubLog.mockResolvedValue({ ...logConfig });
    enumLogFile.mockResolvedValue({
      LogFiles: [
        { ...logFile, FilePath_str: '@security_log/DEFAULT/20260705.log' },
        { ...logFile, FilePath_str: '@security_log/DEFAULT/20260706.log' },
      ],
    });
    const user = userEvent.setup();

    render(<HubLogs hub="DEFAULT" />);
    await user.click(screen.getByRole('tab', { name: 'Files' }));

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('@security_log/DEFAULT/20260706.log')).toBeInTheDocument();
    expect(within(rows[2]).getByText('@security_log/DEFAULT/20260705.log')).toBeInTheDocument();
  });

  it('downloads a log file', async () => {
    getHubLog.mockResolvedValue({ ...logConfig });
    enumLogFile.mockResolvedValue({ LogFiles: [logFile] });
    readLogFile.mockResolvedValueOnce({ Buffer_bin: b64('log body') }).mockResolvedValueOnce({ Buffer_bin: '' });
    const user = userEvent.setup();

    render(<HubLogs hub="DEFAULT" />);
    await user.click(screen.getByRole('tab', { name: 'Files' }));
    const row = (await screen.findByText('@security_log/DEFAULT/20260706.log')).closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Download' }));

    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][1]).toBe('vpn1__security_log_DEFAULT_20260706.log');
  });

  it('truncates oversized previews without reading the full file', async () => {
    getHubLog.mockResolvedValue({ ...logConfig });
    enumLogFile.mockResolvedValue({ LogFiles: [logFile] });
    const largePayload = b64('x'.repeat(1_100_000));
    readLogFile.mockResolvedValueOnce({ Buffer_bin: largePayload });
    const user = userEvent.setup();

    render(<HubLogs hub="DEFAULT" />);
    await user.click(screen.getByRole('tab', { name: 'Files' }));
    const row = screen.getByText('@security_log/DEFAULT/20260706.log').closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'View' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Preview: showing the first/i)).toBeInTheDocument();
    expect(readLogFile).toHaveBeenCalledTimes(1);
  });

  it('shows capability messages when log RPCs are unsupported', async () => {
    serverState.capsList = [
      { CapsName_str: 'b_support_config_log', CapsValue_u32: 0 },
      { CapsName_str: 'b_support_read_log', CapsValue_u32: 0 },
    ];
    const user = userEvent.setup();

    render(<HubLogs hub="DEFAULT" />);

    expect(await screen.findByText('Log settings are not supported by this server')).toBeInTheDocument();
    expect(getHubLog).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Files' }));
    expect(await screen.findByText('Log file browsing is not supported by this server')).toBeInTheDocument();
    expect(enumLogFile).not.toHaveBeenCalled();
  });
});
