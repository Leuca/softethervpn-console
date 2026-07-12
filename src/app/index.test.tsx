import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';
import App from './index';
import { getSession } from './managed/sessionApi';

const testMode = vi.hoisted(() => ({ consoleMode: 'integrated' }));

vi.mock('@app/consoleMode', () => ({
  get consoleMode() {
    return testMode.consoleMode;
  },
}));

vi.mock('@app/ServerContext', () => ({
  ServerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useServer: () => ({ loading: false }),
}));

vi.mock('@app/AppLayout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@app/routes', () => ({
  AppRoutes: () => <div>Integrated app routes</div>,
}));

vi.mock('./managed/sessionApi', () => ({
  getSession: vi.fn(),
  login: vi.fn(),
}));

const getSessionMock = getSession as unknown as Mock;

describe('App root mode switch', () => {
  afterEach(() => {
    testMode.consoleMode = 'integrated';
    vi.clearAllMocks();
  });

  it('renders the app directly in integrated mode', () => {
    render(<App />);

    expect(screen.getByText('Integrated app routes')).toBeInTheDocument();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('gates the app behind a managed session in managed mode', async () => {
    testMode.consoleMode = 'managed';
    getSessionMock.mockResolvedValue({ authenticated: false });

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText('Integrated app routes')).not.toBeInTheDocument();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
