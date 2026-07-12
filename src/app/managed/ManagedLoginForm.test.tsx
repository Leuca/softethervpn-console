import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedLoginForm } from './ManagedLoginForm';
import { login } from './sessionApi';

vi.mock('./sessionApi', () => ({
  login: vi.fn(),
}));

const loginMock = login as unknown as Mock;

describe('ManagedLoginForm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('submits the selected server and reports the authenticated session', async () => {
    const session = { authenticated: true, host: 'vpn.example.com', port: 443, hub: '' };
    loginMock.mockResolvedValue(session);
    const onLogin = vi.fn();
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText('Server host'), 'vpn.example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        host: 'vpn.example.com',
        port: 443,
        hub: '',
        password: 'secret',
        allowSelfSigned: false,
      }),
    );
    expect(onLogin).toHaveBeenCalledWith(session);
  });

  it('submits optional hub and self-signed certificate settings', async () => {
    const session = { authenticated: true, host: 'vpn.example.com', port: 5555, hub: 'DEFAULT' };
    loginMock.mockResolvedValue(session);
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText('Server host'), 'vpn.example.com');
    await user.clear(screen.getByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '5555');
    await user.type(screen.getByLabelText('Virtual Hub'), 'DEFAULT');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByLabelText('Allow a self-signed SoftEther server certificate'));
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        host: 'vpn.example.com',
        port: 5555,
        hub: 'DEFAULT',
        password: 'secret',
        allowSelfSigned: true,
      }),
    );
  });

  it('shows login errors inline', async () => {
    loginMock.mockRejectedValue(new Error('Authentication failed'));
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText('Server host'), 'vpn.example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Login failed')).toBeInTheDocument();
    expect(screen.getByText('Authentication failed')).toBeInTheDocument();
  });
});
