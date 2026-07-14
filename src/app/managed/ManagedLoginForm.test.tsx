import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_LOGIN_HINTS_KEY, ManagedLoginForm } from './ManagedLoginForm';
import { ManagedSessionApiError, login } from './sessionApi';

vi.mock('./sessionApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sessionApi')>()),
  login: vi.fn(),
}));

const loginMock = login as unknown as Mock;

describe('ManagedLoginForm', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('submits the selected server and reports the authenticated session', async () => {
    const session = { authenticated: true, host: 'vpn.example.com', port: 443, hub: '' };
    loginMock.mockResolvedValue(session);
    const onLogin = vi.fn();
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText('Server host'), 'vpn.example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.keyboard('{Enter}');

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

  it('keeps one stable login action while authenticating', async () => {
    loginMock.mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText('Server host'), 'vpn.example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    const submit = screen.getByRole('button', { name: 'Log in' });
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submit.closest('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Logging in');
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
    await user.click(screen.getByRole('button', { name: 'Advanced connection options' }));
    await user.click(screen.getByLabelText('Allow a self-signed SoftEther server certificate'));
    expect(screen.getByRole('button', { name: 'Advanced connection options' })).toBeInTheDocument();
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

  it('shows accessible field validation before contacting the gateway', async () => {
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.clear(screen.getByLabelText('Port'));
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const host = screen.getByLabelText('Server host');
    expect(host).toHaveFocus();
    expect(host).toHaveAccessibleDescription(/Enter the SoftEther server host name or IP address\./);
    expect(screen.getByLabelText('Port')).toHaveAccessibleDescription(/Enter a TCP port between 1 and 65535\./);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/Enter the administrator password\./);
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('form', { name: 'SoftEther server login' })).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      new ManagedSessionApiError('The server did not accept these login details.', 401),
      'Login details rejected',
      'Check the administrator password and Virtual Hub, then try again.',
    ],
    [
      new ManagedSessionApiError('The server certificate could not be verified.', 502),
      'Certificate verification failed',
      'Check the server address and certificate. For a trusted private server, allow self-signed certificates under Advanced connection options.',
    ],
    [
      new ManagedSessionApiError('The selected server could not be reached.', 502),
      'Server unavailable',
      'Check the server address and port, confirm that the server is running, then try again.',
    ],
  ])('presents a specific login failure', async (failure, title, message) => {
    loginMock.mockRejectedValue(failure);
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText('Server host'), 'vpn.example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const liveRegion = (await screen.findByText(message)).closest('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent(title);
    expect(document.getElementById('managed-login-error')).toHaveFocus();
    expect(screen.getByLabelText('Server host')).toHaveValue('vpn.example.com');
  });

  it('remembers and prefills only non-secret server details', async () => {
    const session = { authenticated: true, host: 'vpn.example.com', port: 5555, hub: 'DEFAULT' };
    loginMock.mockResolvedValue(session);
    const user = userEvent.setup();
    const rendered = render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText('Server host'), 'vpn.example.com');
    await user.clear(screen.getByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '5555');
    await user.type(screen.getByLabelText('Virtual Hub'), 'DEFAULT');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Advanced connection options' }));
    await user.click(screen.getByLabelText('Allow a self-signed SoftEther server certificate'));
    await user.click(screen.getByLabelText('Remember server details on this browser'));
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY)).not.toBeNull());
    expect(JSON.parse(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY) ?? '{}')).toEqual({
      host: 'vpn.example.com',
      port: 5555,
      hub: 'DEFAULT',
      allowSelfSigned: true,
    });

    rendered.unmount();
    render(<ManagedLoginForm onLogin={vi.fn()} />);

    expect(screen.getByLabelText('Server host')).toHaveValue('vpn.example.com');
    expect(screen.getByLabelText('Port')).toHaveValue(5555);
    expect(screen.getByLabelText('Virtual Hub')).toHaveValue('DEFAULT');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Allow a self-signed SoftEther server certificate')).toBeChecked();
    expect(screen.getByLabelText('Remember server details on this browser')).toBeChecked();

    await user.click(screen.getByLabelText('Remember server details on this browser'));
    expect(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY)).toBeNull();
  });
});
