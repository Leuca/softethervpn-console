import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynDNS } from './DDNS';
import { api } from '@app/utils/vpnrpc_settings';
import { SELF_SIGNED_CERT_B64 } from '@app/utils/x509.fixture';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetDDnsClientStatus: vi.fn(),
    ChangeDDnsClientHostname: vi.fn(),
    GetDDnsInternetSettng: vi.fn(),
    SetDDnsInternetSettng: vi.fn(),
    GetServerCert: vi.fn(),
    RegenerateServerCert: vi.fn(),
  },
}));

let ddnsProxy = false;
vi.mock('@app/ServerContext', () => ({
  useServer: () => ({ ddnsProxy }),
}));

const getStatus = api.GetDDnsClientStatus as unknown as Mock;
const changeHostname = api.ChangeDDnsClientHostname as unknown as Mock;
const getProxy = api.GetDDnsInternetSettng as unknown as Mock;
const setProxy = api.SetDDnsInternetSettng as unknown as Mock;
const getServerCert = api.GetServerCert as unknown as Mock;
const regenerateServerCert = api.RegenerateServerCert as unknown as Mock;

// The fixture cert has CN=test.example.com and is self-signed.
const CERT_FQDN = 'test.example.com';

const status = (over: Record<string, unknown> = {}) => ({
  CurrentHostName_str: 'vpn123456',
  CurrentFqdn_str: 'vpn123456.softether.net',
  DnsSuffix_str: '.softether.net',
  CurrentIPv4_str: '203.0.113.5',
  CurrentIPv6_str: '',
  Err_IPv4_u32: 0,
  Err_IPv6_u32: 1,
  ErrStr_IPv4_utf: '',
  ErrStr_IPv6_utf: 'No address.detail',
  ...over,
});

describe('DynDNS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ddnsProxy = false;
    // Default: no server certificate, so the CN prompt does not appear.
    getServerCert.mockResolvedValue({ Cert_bin: '' });
  });

  it('shows the FQDN and IPv4, and the summarized IPv6 error', async () => {
    getStatus.mockResolvedValue(status());

    render(<DynDNS />);

    expect(await screen.findByText('vpn123456.softether.net')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.5')).toBeInTheDocument();
    // IPv6 has an error: only the summary before the first dot is shown
    expect(screen.getByText('No address')).toBeInTheDocument();
  });

  it('disables Set while the hostname is unchanged and validates input', async () => {
    getStatus.mockResolvedValue(status());
    const user = userEvent.setup();

    render(<DynDNS />);
    await screen.findByText('vpn123456.softether.net');

    const setBtn = screen.getByRole('button', { name: 'Set hostname' });
    expect(setBtn).toBeDisabled();

    const input = screen.getByLabelText('New hostname');
    await user.clear(input);
    await user.type(input, 'ab'); // too short
    expect(screen.getByText(/At least 3 characters/i)).toBeInTheDocument();
    expect(setBtn).toBeDisabled();
  });

  it('changes the hostname and reloads', async () => {
    getStatus.mockResolvedValue(status());
    changeHostname.mockResolvedValue({});
    const user = userEvent.setup();

    render(<DynDNS />);
    await screen.findByText('vpn123456.softether.net');

    const input = screen.getByLabelText('New hostname');
    await user.clear(input);
    await user.type(input, 'newname');
    await user.click(screen.getByRole('button', { name: 'Set hostname' }));

    await waitFor(() => expect(changeHostname).toHaveBeenCalledTimes(1));
    expect(changeHostname.mock.calls[0][0].StrValue_str).toBe('newname');
  });

  it('offers to regenerate the server cert when its CN no longer matches the FQDN', async () => {
    // initial FQDN matches the cert CN; after the change it differs
    getStatus.mockResolvedValueOnce(status({ CurrentFqdn_str: CERT_FQDN, CurrentHostName_str: CERT_FQDN.split('.')[0] }));
    getStatus.mockResolvedValue(status({ CurrentFqdn_str: 'newname.softether.net', CurrentHostName_str: 'newname' }));
    changeHostname.mockResolvedValue({});
    getServerCert.mockResolvedValue({ Cert_bin: SELF_SIGNED_CERT_B64 }); // self-signed, CN=test.example.com
    regenerateServerCert.mockResolvedValue({});
    const user = userEvent.setup();

    render(<DynDNS />);
    await screen.findByLabelText('New hostname');
    const input = screen.getByLabelText('New hostname');
    await user.clear(input);
    await user.type(input, 'newname');
    await user.click(screen.getByRole('button', { name: 'Set hostname' }));

    // CN (test.example.com) != new FQDN (newname.softether.net) -> prompt
    expect(await screen.findByText('Update the server certificate?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Regenerate certificate' }));

    await waitFor(() => expect(regenerateServerCert).toHaveBeenCalledTimes(1));
    expect(regenerateServerCert.mock.calls[0][0].StrValue_str).toBe('newname.softether.net');
  });

  it('does not prompt to regenerate when the cert CN already matches', async () => {
    // reloaded FQDN equals the cert CN (test.example.com)
    getStatus.mockResolvedValue(status({ CurrentFqdn_str: CERT_FQDN, CurrentHostName_str: 'oldname' }));
    changeHostname.mockResolvedValue({});
    getServerCert.mockResolvedValue({ Cert_bin: SELF_SIGNED_CERT_B64 }); // CN matches the FQDN
    const user = userEvent.setup();

    render(<DynDNS />);
    await screen.findByLabelText('New hostname');
    const input = screen.getByLabelText('New hostname');
    await user.clear(input);
    await user.type(input, 'newname');
    await user.click(screen.getByRole('button', { name: 'Set hostname' }));

    await waitFor(() => expect(changeHostname).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getServerCert).toHaveBeenCalled());
    expect(screen.queryByText('Update the server certificate?')).not.toBeInTheDocument();
    expect(regenerateServerCert).not.toHaveBeenCalled();
  });

  it('does not render the proxy section without the capability', async () => {
    getStatus.mockResolvedValue(status());

    render(<DynDNS />);
    await screen.findByText('vpn123456.softether.net');

    expect(screen.queryByText('Proxy for the DDNS client')).not.toBeInTheDocument();
    expect(getProxy).not.toHaveBeenCalled();
  });

  it('loads and saves proxy settings when the capability is present', async () => {
    ddnsProxy = true;
    getStatus.mockResolvedValue(status());
    getProxy.mockResolvedValue({
      ProxyType_u32: 1,
      ProxyHostName_str: 'proxy.local',
      ProxyPort_u32: 3128,
      ProxyUsername_str: 'u',
      ProxyPassword_str: 'p',
    });
    setProxy.mockResolvedValue({});
    const user = userEvent.setup();

    render(<DynDNS />);

    expect(await screen.findByText('Proxy for the DDNS client')).toBeInTheDocument();
    expect(screen.getByLabelText('Proxy host name')).toHaveValue('proxy.local');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(setProxy).toHaveBeenCalledTimes(1));
    const param = setProxy.mock.calls[0][0];
    expect(param.ProxyType_u32).toBe(1);
    expect(param.ProxyHostName_str).toBe('proxy.local');
  });

  it('degrades to an info note when the proxy RPC is unsupported (code 33)', async () => {
    ddnsProxy = true;
    getStatus.mockResolvedValue(status());
    getProxy.mockRejectedValue(new Error('Error: Code=33, Message=Error code 33: Unsupported.'));

    render(<DynDNS />);

    expect(await screen.findByText('Proxy configuration is not supported by this server')).toBeInTheDocument();
    // no danger alert, and no proxy form fields
    expect(screen.queryByText('Proxy settings error')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Proxy host name')).not.toBeInTheDocument();
  });

  it('shows an error when the status fails to load', async () => {
    getStatus.mockRejectedValue(new Error('boom'));

    render(<DynDNS />);

    expect(await screen.findByText('Could not load Dynamic DNS status')).toBeInTheDocument();
  });
});
