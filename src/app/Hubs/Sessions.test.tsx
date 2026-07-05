import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sessions } from './Sessions';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumSession: vi.fn(),
    GetSessionStatus: vi.fn(),
    EnumMacTable: vi.fn(),
    EnumIpTable: vi.fn(),
    DeleteSession: vi.fn(),
  },
}));

const enumSession = api.EnumSession as unknown as Mock;
const getSessionStatus = api.GetSessionStatus as unknown as Mock;
const enumMacTable = api.EnumMacTable as unknown as Mock;
const enumIpTable = api.EnumIpTable as unknown as Mock;
const deleteSession = api.DeleteSession as unknown as Mock;

const sid = {
  Name_str: 'SID-ALICE-1',
  RemoteSession_bool: false,
  RemoteHostname_str: '',
  Username_str: 'alice',
  ClientIP_ip: '10.0.0.5',
  Hostname_str: 'alice-pc',
  MaxNumTcp_u32: 8,
  CurrentNumTcp_u32: 1,
  PacketSize_u64: 123456,
  PacketNum_u64: 789,
  LinkMode_bool: false,
  SecureNATMode_bool: false,
  BridgeMode_bool: false,
  Layer3Mode_bool: false,
  VLanId_u32: 0,
};

describe('Sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists sessions with location, user and transfer', async () => {
    enumSession.mockResolvedValue({ SessionList: [sid] });

    render(<Sessions hub="DEFAULT" />);

    expect(await screen.findByText('SID-ALICE-1')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getByText('1 / 8')).toBeInTheDocument();
    expect(screen.getByText(/123,456 bytes \/ 789 packets/)).toBeInTheDocument();
    expect(enumSession.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an empty state when the hub has no sessions', async () => {
    enumSession.mockResolvedValue({ SessionList: [] });

    render(<Sessions hub="DEFAULT" />);

    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
  });

  it('shows an error when enumeration fails', async () => {
    enumSession.mockRejectedValue(new Error('boom'));

    render(<Sessions hub="DEFAULT" />);

    expect(await screen.findByText('Session operation failed')).toBeInTheDocument();
  });

  it('opens the detail modal with the session MAC and IP tables', async () => {
    enumSession.mockResolvedValue({ SessionList: [sid] });
    getSessionStatus.mockResolvedValue({ Username_str: 'alice', Connected_bool: true });
    enumMacTable.mockResolvedValue({
      MacTable: [
        {
          Key_u32: 1,
          SessionName_str: 'SID-ALICE-1',
          MacAddress_bin: 'qrvM3e7/', // AA:BB:CC:DD:EE:FF
          VlanId_u32: 0,
          CreatedTime_dt: '2026-07-04T10:00:00.000Z',
          UpdatedTime_dt: '2026-07-04T10:05:00.000Z',
        },
        { Key_u32: 2, SessionName_str: 'SID-OTHER', MacAddress_bin: '', VlanId_u32: 0 },
      ],
    });
    enumIpTable.mockResolvedValue({
      IpTable: [
        {
          Key_u32: 1,
          SessionName_str: 'SID-ALICE-1',
          IpAddress_ip: '192.168.30.10',
          DhcpAllocated_bool: true,
          CreatedTime_dt: '2026-07-04T10:00:00.000Z',
          UpdatedTime_dt: '2026-07-04T10:05:00.000Z',
        },
      ],
    });
    const user = userEvent.setup();

    render(<Sessions hub="DEFAULT" />);
    await screen.findByText('SID-ALICE-1');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Session details' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
    expect(within(dialog).getByText('192.168.30.10')).toBeInTheDocument();
    // The other session's MAC entry is filtered out.
    expect(within(dialog).queryByText('SID-OTHER')).not.toBeInTheDocument();
    expect(getSessionStatus.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Name_str: 'SID-ALICE-1' });
  });

  it('disconnects a session after confirmation', async () => {
    enumSession.mockResolvedValue({ SessionList: [sid] });
    deleteSession.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Sessions hub="DEFAULT" />);
    await screen.findByText('SID-ALICE-1');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    expect(deleteSession).toHaveBeenCalledOnce();
    expect(deleteSession.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Name_str: 'SID-ALICE-1' });
  });
});
