import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('switches to another tab showing its placeholder', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HubDetail name="DEFAULT" />
      </MemoryRouter>,
    );
    await screen.findByText('Standalone');

    await user.click(screen.getByRole('tab', { name: 'Users' }));

    expect(await screen.findByText('Users coming soon')).toBeInTheDocument();
  });
});
