import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyProtocols } from './LegacyProtocols';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetIPsecServices: vi.fn(),
    SetIPsecServices: vi.fn(),
    GetOpenVpnSstpConfig: vi.fn(),
    SetOpenVpnSstpConfig: vi.fn(),
    EnumHub: vi.fn(),
    MakeOpenVpnConfigFile: vi.fn(),
  },
}));

const m = (name: keyof typeof api) => api[name] as unknown as Mock;

const setup = () => {
  m('GetIPsecServices').mockResolvedValue({
    L2TP_Raw_bool: false,
    L2TP_IPsec_bool: true,
    EtherIP_IPsec_bool: false,
    IPsec_Secret_str: 'vpn',
    L2TP_DefaultHub_str: 'DEFAULT',
  });
  m('GetOpenVpnSstpConfig').mockResolvedValue({
    EnableOpenVPN_bool: true,
    OpenVPNPortList_str: '1194',
    EnableSSTP_bool: false,
  });
  m('EnumHub').mockResolvedValue({ HubList: [{ HubName_str: 'DEFAULT' }, { HubName_str: 'VPN' }] });
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/functionalities/legacyprotocols']}>
      <Routes>
        <Route path="/functionalities/legacyprotocols" element={<LegacyProtocols />} />
        <Route path="/functionalities/legacyprotocols/etherip" element={<div>EtherIP page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('LegacyProtocols', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the current protocol settings', async () => {
    setup();
    renderPage();

    expect(await screen.findByRole('switch', { name: /L2TP over IPsec/i })).toBeChecked();
    expect(screen.getByRole('switch', { name: /OpenVPN clone server/i })).toBeChecked();
    expect(screen.getByRole('switch', { name: /SSTP/i })).not.toBeChecked();
    expect(screen.getByLabelText('IPsec pre-shared key')).toHaveValue('vpn');
  });

  it('saves both IPsec and OpenVPN/SSTP config with the edits', async () => {
    setup();
    m('SetIPsecServices').mockResolvedValue({});
    m('SetOpenVpnSstpConfig').mockResolvedValue({});
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('switch', { name: /L2TP over IPsec/i });

    await user.click(screen.getByRole('switch', { name: /EtherIP \/ L2TPv3 over IPsec/i }));
    await user.click(screen.getByRole('switch', { name: /SSTP/i }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m('SetOpenVpnSstpConfig')).toHaveBeenCalledTimes(1));
    expect(m('SetIPsecServices').mock.calls[0][0].EtherIP_IPsec_bool).toBe(true);
    expect(m('SetOpenVpnSstpConfig').mock.calls[0][0].EnableSSTP_bool).toBe(true);
  });

  it('navigates to the EtherIP detailed settings', async () => {
    setup();
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('switch', { name: /L2TP over IPsec/i });
    await user.click(screen.getByRole('button', { name: /EtherIP \/ L2TPv3 detailed settings/i }));

    expect(await screen.findByText('EtherIP page')).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    m('GetIPsecServices').mockRejectedValue(new Error('boom'));
    m('GetOpenVpnSstpConfig').mockResolvedValue({});
    m('EnumHub').mockResolvedValue({ HubList: [] });

    renderPage();

    expect(await screen.findByText('Could not load or save legacy protocol settings')).toBeInTheDocument();
  });
});
