import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VpnAzure } from './VPNAzure';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetAzureStatus: vi.fn(),
    SetAzureStatus: vi.fn(),
    GetDDnsClientStatus: vi.fn(),
  },
}));

const getAzureStatus = api.GetAzureStatus as unknown as Mock;
const setAzureStatus = api.SetAzureStatus as unknown as Mock;
const getDDnsClientStatus = api.GetDDnsClientStatus as unknown as Mock;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/functionalities/vpnazure']}>
      <Routes>
        <Route path="/functionalities/vpnazure" element={<VpnAzure />} />
        <Route path="/functionalities/ddns" element={<div>DDNS page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('VpnAzure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the hostname and connected status when enabled', async () => {
    getAzureStatus.mockResolvedValue({ IsEnabled_bool: true, IsConnected_bool: true });
    getDDnsClientStatus.mockResolvedValue({ CurrentHostName_str: 'vpn123456' });

    renderPage();

    expect(await screen.findByText('vpn123456.vpnazure.net')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('hides the hostname section when disabled', async () => {
    getAzureStatus.mockResolvedValue({ IsEnabled_bool: false, IsConnected_bool: false });

    renderPage();

    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.queryByText('VPN Azure hostname')).not.toBeInTheDocument();
    expect(getDDnsClientStatus).not.toHaveBeenCalled();
  });

  it('enables VPN Azure via the toggle and reloads status', async () => {
    vi.useFakeTimers();
    getAzureStatus
      .mockResolvedValueOnce({ IsEnabled_bool: false, IsConnected_bool: false })
      .mockResolvedValueOnce({ IsEnabled_bool: true, IsConnected_bool: true });
    getDDnsClientStatus.mockResolvedValue({ CurrentHostName_str: 'vpn123456' });
    setAzureStatus.mockResolvedValue({ IsEnabled_bool: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage();
    await screen.findByText('Not connected');

    await user.click(screen.getByRole('switch'));

    await waitFor(() => expect(setAzureStatus).toHaveBeenCalledTimes(1));
    expect(setAzureStatus.mock.calls[0][0].IsEnabled_bool).toBe(true);
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
    expect(screen.getByText('Connecting')).toBeInTheDocument();
    expect(await screen.findByText('vpn123456.vpnazure.net')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1000);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(getAzureStatus).toHaveBeenCalledTimes(2);
  });

  it('navigates to the DDNS page from Change hostname', async () => {
    getAzureStatus.mockResolvedValue({ IsEnabled_bool: true, IsConnected_bool: true });
    getDDnsClientStatus.mockResolvedValue({ CurrentHostName_str: 'vpn123456' });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('vpn123456.vpnazure.net');

    await user.click(screen.getByRole('button', { name: 'Change hostname' }));

    expect(await screen.findByText('DDNS page')).toBeInTheDocument();
  });

  it('shows an error alert when loading fails', async () => {
    getAzureStatus.mockRejectedValue(new Error('boom'));

    renderPage();

    expect(await screen.findByText('VPN Azure operation failed')).toBeInTheDocument();
  });
});
