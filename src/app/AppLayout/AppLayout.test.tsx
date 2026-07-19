import * as React from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';

vi.mock('@app/ServerContext', () => ({
  useServer: () => ({
    user: 'Administrator',
    hideAdminOnly: false,
    hideNonCluster: false,
    hideNonBridge: false,
    hiddenLabels: new Set<string>(),
  }),
}));

vi.mock('@app/managed/ManagedSessionGate', () => ({
  useManagedSession: () => null,
}));

vi.mock('@app/routes', () => ({
  routes: [
    { label: 'Dashboard', path: '/' },
    { label: 'Next page', path: '/next' },
  ],
  isRouteAccessible: () => true,
}));

const RouteControl = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/next')}>
      Open next page
    </button>
  );
};

describe('AppLayout accessibility', () => {
  it('moves focus to a focusable main landmark after route changes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppLayout>
          <RouteControl />
        </AppLayout>
      </MemoryRouter>,
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('tabindex', '-1');

    await user.click(screen.getByRole('button', { name: 'Open next page' }));
    await waitFor(() => expect(main).toHaveFocus());
  });
});
