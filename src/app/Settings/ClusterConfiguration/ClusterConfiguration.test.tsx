import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusterConfig } from './ClusterConfiguration';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetFarmSetting: vi.fn(), SetFarmSetting: vi.fn() },
}));

const getFarm = api.GetFarmSetting as unknown as Mock;
const setFarm = api.SetFarmSetting as unknown as Mock;

// Minimal GetFarmSetting responses per server type.
const standalone = { ServerType_u32: 0, Weight_u32: 100 };
const controller = { ServerType_u32: 1, Weight_u32: 200, ControllerOnly_bool: true };
const member = {
  ServerType_u32: 2,
  Weight_u32: 100,
  Ports_u32: [443, 992],
  PublicIp_ip: '203.0.113.5',
  ControllerName_str: 'ctrl.example.com',
  ControllerPort_u32: 443,
  MemberPasswordPlaintext_str: 'secret',
};

describe('ClusterConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the current mode and standalone selection on load', async () => {
    getFarm.mockResolvedValue(standalone);
    render(<ClusterConfig />);

    expect(await screen.findByText('Standalone Mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Standalone server (no clustering)')).toBeChecked();
    // Member-only fields are hidden in standalone mode.
    expect(screen.queryByLabelText('Public port list')).not.toBeInTheDocument();
  });

  it('seeds the member fields from the response', async () => {
    getFarm.mockResolvedValue(member);
    render(<ClusterConfig />);

    expect(await screen.findByText('Cluster Member Server')).toBeInTheDocument();
    expect(screen.getByLabelText('Cluster member server')).toBeChecked();
    expect((screen.getByLabelText('Public port list') as HTMLInputElement).value).toBe('443, 992');
    expect((screen.getByLabelText('Controller host name or IP address') as HTMLInputElement).value).toBe(
      'ctrl.example.com',
    );
  });

  it('saves a controller configuration after confirming', async () => {
    getFarm.mockResolvedValue(controller);
    setFarm.mockResolvedValue({});
    const user = userEvent.setup();

    render(<ClusterConfig />);
    expect(await screen.findByText('Cluster Controller')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Save and restart' }));

    await waitFor(() => expect(setFarm).toHaveBeenCalledTimes(1));
    const sent = setFarm.mock.calls[0][0];
    expect(sent.ServerType_u32).toBe(1);
    expect(sent.ControllerOnly_bool).toBe(true);
    expect(sent.Weight_u32).toBe(200);
  });

  it('sends parsed ports and count for a member configuration', async () => {
    getFarm.mockResolvedValue(member);
    setFarm.mockResolvedValue({});
    const user = userEvent.setup();

    render(<ClusterConfig />);
    await screen.findByText('Cluster Member Server');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Save and restart' }));

    await waitFor(() => expect(setFarm).toHaveBeenCalledTimes(1));
    const sent = setFarm.mock.calls[0][0];
    expect(sent.ServerType_u32).toBe(2);
    expect(sent.Ports_u32).toEqual([443, 992]);
    expect(sent.NumPort_u32).toBe(2);
    expect(sent.ControllerName_str).toBe('ctrl.example.com');
  });

  it('disables Save while a member field is invalid', async () => {
    getFarm.mockResolvedValue(member);
    const user = userEvent.setup();

    render(<ClusterConfig />);
    await screen.findByText('Cluster Member Server');

    // Empty the required host name.
    await user.clear(screen.getByLabelText('Controller host name or IP address'));
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  it('rejects an invalid public IP address', async () => {
    getFarm.mockResolvedValue(member);
    const user = userEvent.setup();

    render(<ClusterConfig />);
    await screen.findByText('Cluster Member Server');

    const ip = screen.getByLabelText('Public IP address');
    await user.clear(ip);
    await user.type(ip, '999.1.1.1');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(screen.getByText('Enter a valid IPv4 address, or leave empty.')).toBeInTheDocument();
  });

  it('shows a restarting notice (not an error) after saving', async () => {
    getFarm.mockResolvedValue(controller);
    setFarm.mockResolvedValue({});
    const user = userEvent.setup();

    render(<ClusterConfig />);
    await screen.findByText('Cluster Controller');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Save and restart' }));

    expect(await screen.findByText(/Waiting for the VPN server to restart/i)).toBeInTheDocument();
    expect(screen.queryByText('Could not load or save the clustering configuration')).not.toBeInTheDocument();
  });

  it('does not save when the confirmation is cancelled', async () => {
    getFarm.mockResolvedValue(controller);
    const user = userEvent.setup();

    render(<ClusterConfig />);
    await screen.findByText('Cluster Controller');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(setFarm).not.toHaveBeenCalled();
  });

  it('shows an error when loading fails', async () => {
    getFarm.mockRejectedValue(new Error('boom'));
    render(<ClusterConfig />);
    expect(await screen.findByText('Could not load or save the clustering configuration')).toBeInTheDocument();
  });
});
