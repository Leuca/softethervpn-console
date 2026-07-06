import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubTables } from './HubTables';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumMacTable: vi.fn(),
    EnumIpTable: vi.fn(),
    DeleteMacTable: vi.fn(),
    DeleteIpTable: vi.fn(),
  },
}));

const enumMacTable = api.EnumMacTable as unknown as Mock;
const enumIpTable = api.EnumIpTable as unknown as Mock;
const deleteMacTable = api.DeleteMacTable as unknown as Mock;
const deleteIpTable = api.DeleteIpTable as unknown as Mock;

const macEntry = {
  Key_u32: 10,
  SessionName_str: 'SID-ALICE-1',
  MacAddress_bin: 'qrvM3e7/', // AA:BB:CC:DD:EE:FF
  VlanId_u32: 100,
  CreatedTime_dt: '2026-07-04T10:00:00.000Z',
  UpdatedTime_dt: '2026-07-04T10:05:00.000Z',
  RemoteItem_bool: false,
  RemoteHostname_str: '',
};

const ipEntry = {
  Key_u32: 20,
  SessionName_str: 'SID-BOB-1',
  IpAddress_ip: '192.168.30.10',
  DhcpAllocated_bool: true,
  CreatedTime_dt: '2026-07-04T10:00:00.000Z',
  UpdatedTime_dt: '2026-07-04T10:05:00.000Z',
  RemoteItem_bool: true,
  RemoteHostname_str: 'cluster-2',
};

describe('HubTables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enumMacTable.mockResolvedValue({ MacTable: [macEntry] });
    enumIpTable.mockResolvedValue({ IpTable: [ipEntry] });
    deleteMacTable.mockResolvedValue({});
    deleteIpTable.mockResolvedValue({});
  });

  it('loads the hub MAC table by default', async () => {
    render(<HubTables hub="DEFAULT" />);

    expect(await screen.findByText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
    expect(screen.getByText('SID-ALICE-1')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(enumMacTable.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(enumIpTable.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('switches to the hub IP table', async () => {
    const user = userEvent.setup();

    render(<HubTables hub="DEFAULT" />);
    await screen.findByText('AA:BB:CC:DD:EE:FF');
    await user.click(screen.getByRole('tab', { name: 'IP address table' }));

    expect(await screen.findByText('192.168.30.10')).toBeInTheDocument();
    expect(screen.getByText('SID-BOB-1')).toBeInTheDocument();
    expect(screen.getByText('cluster-2')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shows an empty state when both tables are empty', async () => {
    enumMacTable.mockResolvedValue({ MacTable: [] });
    enumIpTable.mockResolvedValue({ IpTable: [] });

    render(<HubTables hub="DEFAULT" />);

    expect(await screen.findByText('No MAC addresses')).toBeInTheDocument();
  });

  it('shows an error when table enumeration fails', async () => {
    enumMacTable.mockRejectedValue(new Error('boom'));

    render(<HubTables hub="DEFAULT" />);

    expect(await screen.findByText('Address table operation failed')).toBeInTheDocument();
    expect(screen.getByText('Error: boom')).toBeInTheDocument();
  });

  it('deletes a MAC table entry after confirmation', async () => {
    const user = userEvent.setup();

    render(<HubTables hub="DEFAULT" />);
    await screen.findByText('AA:BB:CC:DD:EE:FF');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteMacTable).toHaveBeenCalledOnce();
    expect(deleteMacTable.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Key_u32: 10 });
  });

  it('deletes an IP table entry after confirmation', async () => {
    const user = userEvent.setup();

    render(<HubTables hub="DEFAULT" />);
    await screen.findByText('AA:BB:CC:DD:EE:FF');
    await user.click(screen.getByRole('tab', { name: 'IP address table' }));
    await screen.findByText('192.168.30.10');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('192.168.30.10')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteIpTable).toHaveBeenCalledOnce();
    expect(deleteIpTable.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Key_u32: 20 });
  });
});
