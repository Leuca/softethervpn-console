import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubStatus } from './HubStatus';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetHubStatus: vi.fn() },
}));

const getHubStatus = api.GetHubStatus as unknown as Mock;

describe('HubStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders coded fields as readable values', async () => {
    getHubStatus.mockResolvedValue({
      HubName_str: 'DEFAULT',
      Online_bool: true,
      HubType_u32: 0,
      SecureNATEnabled_bool: false,
      NumSessions_u32: 2,
    });

    render(<HubStatus hub="DEFAULT" />);

    // HubType_u32 -> label, SecureNATEnabled_bool -> Disabled
    expect(await screen.findByText('Standalone')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    // and it asked the server for the right hub
    expect(getHubStatus.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an error alert when the call fails', async () => {
    getHubStatus.mockRejectedValue(new Error('nope'));

    render(<HubStatus hub="DEFAULT" />);

    expect(await screen.findByText('Could not load hub status')).toBeInTheDocument();
  });
});
