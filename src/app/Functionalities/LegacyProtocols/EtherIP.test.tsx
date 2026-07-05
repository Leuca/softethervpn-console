import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { EtherIPDetailed } from './EtherIP';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumEtherIpId: vi.fn(),
    AddEtherIpId: vi.fn(),
    DeleteEtherIpId: vi.fn(),
    EnumHub: vi.fn(),
  },
}));

const m = (name: keyof typeof api) => api[name] as unknown as Mock;

const setup = (settings: unknown[] = []) => {
  m('EnumEtherIpId').mockResolvedValue({ Settings: settings });
  m('EnumHub').mockResolvedValue({ HubList: [{ HubName_str: 'DEFAULT' }] });
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <EtherIPDetailed />
    </MemoryRouter>,
  );

describe('EtherIPDetailed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the client settings', async () => {
    setup([{ Id_str: 'router@site', HubName_str: 'DEFAULT', UserName_str: 'site1' }]);
    renderPage();

    const row = (await screen.findByText('router@site')).closest('tr') as HTMLElement;
    expect(within(row).getByText('DEFAULT')).toBeInTheDocument();
    expect(within(row).getByText('site1')).toBeInTheDocument();
  });

  it('shows an empty state when there are none', async () => {
    setup([]);
    renderPage();
    expect(await screen.findByText('No client settings')).toBeInTheDocument();
  });

  it('adds a client setting', async () => {
    setup([]);
    m('AddEtherIpId').mockResolvedValue({});
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('No client settings');
    await user.click(screen.getByRole('button', { name: /add client setting/i }));

    await user.type(screen.getByLabelText('ISAKMP Phase 1 ID'), 'router@site');
    await user.type(screen.getByLabelText('User name'), 'site1');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(m('AddEtherIpId')).toHaveBeenCalledTimes(1));
    expect(m('AddEtherIpId').mock.calls[0][0]).toMatchObject({
      Id_str: 'router@site',
      HubName_str: 'DEFAULT',
      UserName_str: 'site1',
    });
  });

  it('deletes a client setting after confirmation', async () => {
    setup([{ Id_str: 'router@site', HubName_str: 'DEFAULT', UserName_str: 'site1' }]);
    m('DeleteEtherIpId').mockResolvedValue({});
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('router@site');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(m('DeleteEtherIpId')).toHaveBeenCalledTimes(1));
    expect(m('DeleteEtherIpId').mock.calls[0][0].Id_str).toBe('router@site');
  });

  it('shows an error when loading fails', async () => {
    m('EnumEtherIpId').mockRejectedValue(new Error('boom'));
    m('EnumHub').mockResolvedValue({ HubList: [] });
    renderPage();
    expect(await screen.findByText('EtherIP operation failed')).toBeInTheDocument();
  });
});
