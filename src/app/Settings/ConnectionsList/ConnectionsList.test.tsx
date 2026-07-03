import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionsList } from './ConnectionsList';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumConnection: vi.fn(),
    GetConnectionInfo: vi.fn(),
    DisconnectConnection: vi.fn(),
  },
}));

const enumConnection = api.EnumConnection as unknown as Mock;
const getConnectionInfo = api.GetConnectionInfo as unknown as Mock;
const disconnectConnection = api.DisconnectConnection as unknown as Mock;

const oneConnection = {
  ConnectionList: [
    {
      Name_str: 'CID-504',
      Hostname_str: '10.0.0.30',
      Port_u32: 52812,
      ConnectedTime_dt: '2026-07-03T17:17:54.000Z',
      Type_u32: 5, // Management RPC
    },
  ],
};

async function openRowMenu() {
  const user = userEvent.setup();
  const kebab = await screen.findByRole('button', { name: /kebab toggle/i });
  await user.click(kebab);
  return user;
}

describe('ConnectionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a connection row with source and a readable type label', async () => {
    enumConnection.mockResolvedValue(oneConnection);

    render(<ConnectionsList />);

    expect(await screen.findByText('CID-504')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.30:52812')).toBeInTheDocument();
    expect(screen.getByText('Management RPC')).toBeInTheDocument();
  });

  it('shows an empty state when there are no connections', async () => {
    enumConnection.mockResolvedValue({ ConnectionList: [] });

    render(<ConnectionsList />);

    expect(await screen.findByText('No active connections')).toBeInTheDocument();
  });

  it('opens the detail modal and shows connection info', async () => {
    enumConnection.mockResolvedValue(oneConnection);
    getConnectionInfo.mockResolvedValue({ Name_str: 'CID-504', ClientStr_str: 'SoftEther VPN Client' });

    render(<ConnectionsList />);
    await screen.findByText('CID-504');
    const user = await openRowMenu();
    await user.click(await screen.findByText('Connection details'));

    const dialog = await screen.findByRole('dialog');
    expect(getConnectionInfo).toHaveBeenCalledOnce();
    expect(within(dialog).getByText('SoftEther VPN Client')).toBeInTheDocument();
  });

  it('explains a closed connection (code 29) instead of showing a raw error', async () => {
    enumConnection.mockResolvedValue(oneConnection);
    getConnectionInfo.mockRejectedValue(new Error('Error: Code=29, Message=Error code 29: Object not found.'));

    render(<ConnectionsList />);
    await screen.findByText('CID-504');
    const user = await openRowMenu();
    await user.click(await screen.findByText('Connection details'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Connection no longer active')).toBeInTheDocument();
  });

  it('surfaces an unexpected detail-load failure inside the modal', async () => {
    enumConnection.mockResolvedValue(oneConnection);
    getConnectionInfo.mockRejectedValue(new Error('network exploded'));

    render(<ConnectionsList />);
    await screen.findByText('CID-504');
    const user = await openRowMenu();
    await user.click(await screen.findByText('Connection details'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Could not load connection details')).toBeInTheDocument();
  });

  it('disconnects a connection after confirmation and reloads', async () => {
    enumConnection.mockResolvedValue(oneConnection);
    disconnectConnection.mockResolvedValue({});

    render(<ConnectionsList />);
    await screen.findByText('CID-504');
    const user = await openRowMenu();
    await user.click(await screen.findByText('Disconnect'));

    // Confirmation dialog, then confirm
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    expect(disconnectConnection).toHaveBeenCalledOnce();
    // EnumConnection: once on mount, once after the disconnect reload
    expect(enumConnection).toHaveBeenCalledTimes(2);
  });
});
