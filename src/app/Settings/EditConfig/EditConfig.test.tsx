import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditConfig } from './EditConfig';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetConfig: vi.fn(), SetConfig: vi.fn() },
}));

const getConfig = api.GetConfig as unknown as Mock;
const setConfig = api.SetConfig as unknown as Mock;

// base64 of the UTF-8 BOM followed by the given text (the RPC representation).
const configBase64 = (text: string) => btoa(String.fromCharCode(0xef, 0xbb, 0xbf) + text);

describe('EditConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the config into the editor with the BOM stripped', async () => {
    getConfig.mockResolvedValue({ FileName_str: 'vpn_server.config', FileData_bin: configBase64('declare root {\n}\n') });

    render(<EditConfig />);

    const area = (await screen.findByLabelText('VPN server configuration')) as HTMLTextAreaElement;
    expect(area.value).toBe('declare root {\n}\n');
  });

  it('applies edited config (with BOM) after confirming', async () => {
    // GetConfig returns the internal name with the SoftEther '$' prefix.
    getConfig.mockResolvedValue({ FileName_str: '$vpn_server.config', FileData_bin: configBase64('declare root {\n}\n') });
    setConfig.mockResolvedValue({});
    const user = userEvent.setup();

    render(<EditConfig />);
    const area = await screen.findByLabelText('VPN server configuration');
    await user.clear(area);
    await user.type(area, 'uint MaxSessions 99');

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(await screen.findByRole('button', { name: 'Apply and restart' }));

    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    const sent = setConfig.mock.calls[0][0];
    // the '$' prefix is stripped from the file name
    expect(sent.FileName_str).toBe('vpn_server.config');
    // bytes start with the UTF-8 BOM and decode back to the edited text
    expect(Array.from(sent.FileData_bin.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(sent.FileData_bin)).toBe('uint MaxSessions 99');
  });

  it('shows a restarting notice (not an error) after applying', async () => {
    getConfig.mockResolvedValue({ FileName_str: 'vpn_server.config', FileData_bin: configBase64('declare root {}') });
    setConfig.mockResolvedValue({});
    const user = userEvent.setup();

    render(<EditConfig />);
    await screen.findByLabelText('VPN server configuration');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(await screen.findByRole('button', { name: 'Apply and restart' }));

    expect(await screen.findByText(/Waiting for the VPN server to restart/i)).toBeInTheDocument();
    expect(screen.queryByText('Configuration operation failed')).not.toBeInTheDocument();
  });

  it('does not apply when the confirmation is cancelled', async () => {
    getConfig.mockResolvedValue({ FileName_str: 'vpn_server.config', FileData_bin: configBase64('declare root {}') });
    const user = userEvent.setup();

    render(<EditConfig />);
    await screen.findByLabelText('VPN server configuration');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(setConfig).not.toHaveBeenCalled();
  });

  it('shows an error when loading fails', async () => {
    getConfig.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<EditConfig />);

    expect(await screen.findByText('Configuration operation failed')).toBeInTheDocument();
    expect(screen.queryByLabelText('VPN server configuration')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(setConfig).not.toHaveBeenCalled();
  });
});
