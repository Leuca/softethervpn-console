import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubDetail } from './HubDetail';
import { api } from '@app/utils/vpnrpc_settings';

const serverState = { hideNonCluster: false };

vi.mock('@app/ServerContext', () => ({
  useServer: () => serverState,
}));

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetHubStatus: vi.fn() },
}));

const getHubStatus = api.GetHubStatus as unknown as Mock;

describe('HubDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverState.hideNonCluster = false;
    getHubStatus.mockResolvedValue({ HubName_str: 'DEFAULT', Online_bool: true, HubType_u32: 0 });
  });

  it('opens on the Status tab and loads that hub', async () => {
    render(
      <MemoryRouter>
        <HubDetail name="DEFAULT" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Standalone')).toBeInTheDocument();
    expect(getHubStatus.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows the ported management tabs and no placeholder Security Policy tab', async () => {
    render(
      <MemoryRouter>
        <HubDetail name="DEFAULT" />
      </MemoryRouter>,
    );
    await screen.findByText('Standalone');

    for (const name of [
      'Status',
      'Sessions',
      'Tables',
      'Cascade',
      'Properties',
      'Users',
      'Groups',
      'Access List',
      'Secure NAT',
      'Trusted CA',
      'Logs',
      'RADIUS',
    ]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    // Security policy is edited per user/group, not at the hub level, so there
    // is no hub Security Policy tab.
    expect(screen.queryByRole('tab', { name: 'Security Policy' })).not.toBeInTheDocument();
  });

  it('hides Secure NAT and falls back to Status on cluster servers', async () => {
    serverState.hideNonCluster = true;

    render(
      <MemoryRouter initialEntries={['/?tab=securenat']}>
        <HubDetail name="DEFAULT" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Standalone')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Status' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Secure NAT' })).not.toBeInTheDocument();
  });
});
