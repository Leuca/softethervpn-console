import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedSessionGate, useManagedSession } from './ManagedSessionGate';
import { ManagedSession, getSession, login, logout } from './sessionApi';

vi.mock('./sessionApi', () => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const getSessionMock = getSession as unknown as Mock;
const loginMock = login as unknown as Mock;
const logoutMock = logout as unknown as Mock;

const ManagedApp = () => {
  const session = useManagedSession();

  return (
    <div>
      Managed app
      <button type="button" onClick={session?.logout}>
        Log out
      </button>
    </div>
  );
};

const renderGate = () =>
  render(
    <ManagedSessionGate>
      <ManagedApp />
    </ManagedSessionGate>,
  );

describe('ManagedSessionGate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a first-load spinner while checking the session', () => {
    getSessionMock.mockReturnValue(new Promise(() => undefined));

    renderGate();

    expect(screen.getByLabelText('Loading managed session')).toBeInTheDocument();
  });

  it('renders children when a managed session already exists', async () => {
    getSessionMock.mockResolvedValue({ authenticated: true, host: 'vpn.example.com', port: 443, hub: '' });

    renderGate();

    expect(await screen.findByText('Managed app')).toBeInTheDocument();
  });

  it('renders the login form when no managed session exists', async () => {
    getSessionMock.mockResolvedValue({ authenticated: false } satisfies ManagedSession);

    renderGate();

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText('Managed app')).not.toBeInTheDocument();
  });

  it('renders children after a successful login', async () => {
    getSessionMock.mockResolvedValue({ authenticated: false } satisfies ManagedSession);
    loginMock.mockResolvedValue({ authenticated: true, host: 'vpn.example.com', port: 443, hub: '' });
    const user = userEvent.setup();

    renderGate();

    await user.type(await screen.findByLabelText('Server host'), 'vpn.example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Managed app')).toBeInTheDocument();
  });

  it('returns to the login form after logout', async () => {
    getSessionMock.mockResolvedValue({ authenticated: true, host: 'vpn.example.com', port: 443, hub: '' });
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderGate();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(logoutMock).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText('Managed app')).not.toBeInTheDocument();
  });
});
