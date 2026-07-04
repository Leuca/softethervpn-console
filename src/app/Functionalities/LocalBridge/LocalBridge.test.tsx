import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalBridge } from './LocalBridge';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetBridgeSupport: vi.fn(),
    EnumLocalBridge: vi.fn(),
    EnumHub: vi.fn(),
    EnumEthernet: vi.fn(),
    AddLocalBridge: vi.fn(),
    DeleteLocalBridge: vi.fn(),
  },
}));

// Toggle tap support per test; Linux servers expose the tap radio.
let tapSupported = false;
vi.mock('@app/ServerContext', () => ({
  useServer: () => ({ isTapSupported: tapSupported }),
}));

const getBridgeSupport = api.GetBridgeSupport as unknown as Mock;
const enumLocalBridge = api.EnumLocalBridge as unknown as Mock;
const enumHub = api.EnumHub as unknown as Mock;
const enumEthernet = api.EnumEthernet as unknown as Mock;
const addLocalBridge = api.AddLocalBridge as unknown as Mock;
const deleteLocalBridge = api.DeleteLocalBridge as unknown as Mock;

const setup = (options: { bridges?: unknown[]; supported?: boolean } = {}) => {
  getBridgeSupport.mockResolvedValue({ IsBridgeSupportedOs_bool: options.supported ?? true });
  enumLocalBridge.mockResolvedValue({ LocalBridgeList: options.bridges ?? [] });
  enumHub.mockResolvedValue({ HubList: [{ HubName_str: 'DEFAULT' }, { HubName_str: 'VPN' }] });
  enumEthernet.mockResolvedValue({
    EthList: [{ DeviceName_str: 'eth0', NetworkConnectionName_utf: 'Ethernet 0' }],
  });
};

describe('LocalBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tapSupported = false;
  });

  it('lists existing bridges with type and status', async () => {
    setup({
      bridges: [
        { HubNameLB_str: 'DEFAULT', DeviceName_str: 'eth0', TapMode_bool: false, Online_bool: true, Active_bool: true },
        { HubNameLB_str: 'VPN', DeviceName_str: 'tap_vpn', TapMode_bool: true, Online_bool: false, Active_bool: false },
      ],
    });

    render(<LocalBridge />);

    const eth = (await screen.findByText('eth0')).closest('tr') as HTMLElement;
    expect(within(eth).getByText('Network adapter')).toBeInTheDocument();
    expect(within(eth).getByText('Operational')).toBeInTheDocument();

    const tap = screen.getByText('tap_vpn').closest('tr') as HTMLElement;
    expect(within(tap).getByText('Tap device')).toBeInTheDocument();
    expect(within(tap).getByText('Error')).toBeInTheDocument();
  });

  it('shows an empty state when no bridge is defined', async () => {
    setup({ bridges: [] });

    render(<LocalBridge />);

    expect(await screen.findByText('No local bridge defined')).toBeInTheDocument();
  });

  it('creates an adapter bridge from the modal', async () => {
    setup({ bridges: [] });
    addLocalBridge.mockResolvedValue({});
    const user = userEvent.setup();

    render(<LocalBridge />);
    await screen.findByText('No local bridge defined');

    await user.click(screen.getByRole('button', { name: /create local bridge/i }));
    // Adapter is the default destination; hub defaults to the first hub.
    await user.click(await screen.findByRole('button', { name: 'Create' }));

    await waitFor(() => expect(addLocalBridge).toHaveBeenCalledTimes(1));
    const param = addLocalBridge.mock.calls[0][0];
    expect(param.HubNameLB_str).toBe('DEFAULT');
    expect(param.DeviceName_str).toBe('eth0');
    expect(param.TapMode_bool).toBe(false);
  });

  it('creates a tap bridge when tap is supported', async () => {
    tapSupported = true;
    setup({ bridges: [] });
    addLocalBridge.mockResolvedValue({});
    const user = userEvent.setup();

    render(<LocalBridge />);
    await screen.findByText('No local bridge defined');

    await user.click(screen.getByRole('button', { name: /create local bridge/i }));
    await user.click(await screen.findByRole('radio', { name: /new tap device/i }));
    await user.type(screen.getByLabelText('Tap device name'), 'tap_office');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(addLocalBridge).toHaveBeenCalledTimes(1));
    const param = addLocalBridge.mock.calls[0][0];
    expect(param.DeviceName_str).toBe('tap_office');
    expect(param.TapMode_bool).toBe(true);
  });

  it('deletes a bridge after confirmation', async () => {
    setup({
      bridges: [
        { HubNameLB_str: 'DEFAULT', DeviceName_str: 'eth0', TapMode_bool: false, Online_bool: true, Active_bool: true },
      ],
    });
    deleteLocalBridge.mockResolvedValue({});
    const user = userEvent.setup();

    render(<LocalBridge />);
    await screen.findByText('eth0');

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteLocalBridge).toHaveBeenCalledTimes(1));
    const param = deleteLocalBridge.mock.calls[0][0];
    expect(param.HubNameLB_str).toBe('DEFAULT');
    expect(param.DeviceName_str).toBe('eth0');
  });

  it('warns and blocks creation when the OS does not support bridging', async () => {
    setup({ bridges: [], supported: false });

    render(<LocalBridge />);

    expect(await screen.findByText('Local Bridge is not supported on this operating system')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create local bridge/i })).toBeDisabled();
  });

  it('shows an error alert when loading fails', async () => {
    getBridgeSupport.mockRejectedValue(new Error('boom'));
    enumLocalBridge.mockResolvedValue({ LocalBridgeList: [] });
    enumHub.mockResolvedValue({ HubList: [] });
    enumEthernet.mockResolvedValue({ EthList: [] });

    render(<LocalBridge />);

    expect(await screen.findByText('Local bridge operation failed')).toBeInTheDocument();
  });
});
