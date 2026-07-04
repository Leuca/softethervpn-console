import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { About } from './AboutThisServer';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetServerInfo: vi.fn(), GetCaps: vi.fn() },
}));

const getServerInfo = api.GetServerInfo as unknown as Mock;
const getCaps = api.GetCaps as unknown as Mock;

const caps = (partials: Array<{ name: string; value: number; desc: string }>) => ({
  CapsList: partials.map((c) => ({
    CapsName_str: c.name,
    CapsValue_u32: c.value,
    CapsDescrption_utf: c.desc,
  })),
});

describe('About', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders server info with the mode label and de-camel-cased keys', async () => {
    getServerInfo.mockResolvedValue({
      ServerProductName_str: 'SoftEther VPN Server',
      ServerType_u32: 1,
    });
    getCaps.mockResolvedValue(caps([]));

    render(<About />);

    expect(await screen.findByText('Server Product Name')).toBeInTheDocument();
    // ServerType_u32 is rendered as its label, not the raw enum value
    expect(screen.getByText('Cluster Controller')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('renders capabilities as Yes/No flags with numeric limits last', async () => {
    getServerInfo.mockResolvedValue({ ServerType_u32: 0 });
    getCaps.mockResolvedValue(
      caps([
        { name: 'caps_i_max_hubs_u32', value: 4096, desc: 'Maximum number of Virtual Hubs' },
        { name: 'caps_b_support_ipsec_u32', value: 1, desc: 'IPsec / L2TP VPN Server function' },
        { name: 'caps_b_bridge_u32', value: 0, desc: 'Local Bridge function' },
      ]),
    );

    render(<About />);

    expect(await screen.findByText('IPsec / L2TP VPN Server function')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    // numeric limit keeps its (thousands-separated) value
    expect(screen.getByText('4,096')).toBeInTheDocument();

    // "Maximum" limits are ordered after the boolean flags
    const rowLabels = screen.getAllByText(/function|Maximum/).map((el) => el.textContent);
    expect(rowLabels[rowLabels.length - 1]).toBe('Maximum number of Virtual Hubs');
  });

  it('shows an error alert when a call fails', async () => {
    getServerInfo.mockRejectedValue(new Error('boom'));
    getCaps.mockResolvedValue(caps([]));

    render(<About />);

    expect(await screen.findByText('Could not load server information')).toBeInTheDocument();
  });
});
