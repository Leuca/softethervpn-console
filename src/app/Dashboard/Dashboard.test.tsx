import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

vi.mock('@app/ServerContext', () => ({
  useServer: () => ({
    loading: false,
    user: 'Administrator',
    ddnsHostname: '',
    azure: false,
    isBridgeMode: false,
    info: {},
    hideAdminOnly: false,
    hideNonBridge: false,
    hiddenLabels: new Set(['Dynamic DNS', 'VPN Azure', 'Local Bridge', 'Layer 3 Switch', 'Hubs']),
  }),
}));

describe('Dashboard', () => {
  it('omits unavailable services from the server overview', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Dynamic DNS')).not.toBeInTheDocument();
    expect(screen.queryByText('VPN Azure')).not.toBeInTheDocument();
  });
});
