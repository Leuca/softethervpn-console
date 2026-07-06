import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubDetail } from './HubDetail';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetHubStatus: vi.fn() },
}));

const getHubStatus = api.GetHubStatus as unknown as Mock;

describe('HubDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      'Properties',
      'Users',
      'Groups',
      'Access List',
      'Secure NAT',
      'Trusted CA',
      'RADIUS',
    ]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    // Security policy is edited per user/group, not at the hub level, so there
    // is no hub Security Policy tab.
    expect(screen.queryByRole('tab', { name: 'Security Policy' })).not.toBeInTheDocument();
  });
});
