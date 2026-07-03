import * as React from 'react';
import App from '@app/index';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, test, vi } from 'vitest';

// The server probes performed on mount cannot reach a real VPN server in
// tests; reject them all so the app settles into the "plain admin" state.
vi.mock('@app/utils/vpnrpc_settings', () => {
  const reject = () => Promise.reject(new Error('no server in tests'));
  return {
    api: {
      EnumConnection: reject,
      GetFarmSetting: reject,
      GetDDnsClientStatus: reject,
      GetAzureStatus: reject,
      GetCaps: reject,
      GetServerInfo: reject,
    },
  };
});

// PatternFly decides mobile vs desktop from the page element's clientWidth,
// which jsdom reports as 0 (-> "mobile"). Stub a desktop width for the duration
// of a test so the sidebar starts open and we exercise the desktop path.
async function withDesktopWidth(fn: () => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1920 });
  try {
    await fn();
  } finally {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    }
  }
}

describe('App tests', () => {
  test('should render default App component', () => {
    const { asFragment } = render(<App />);

    expect(asFragment()).toMatchSnapshot();
  });

  it('should render a nav-toggle button once the server probes settle', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Global navigation' })).toBeVisible();
  });

  it('should toggle the sidebar when clicking the nav-toggle button', async () => {
    const user = userEvent.setup();

    render(<App />);

    const button = await screen.findByRole('button', { name: 'Global navigation' });
    const initialExpanded = button.getAttribute('aria-expanded');

    await user.click(button);

    expect(button.getAttribute('aria-expanded')).not.toBe(initialExpanded);
  });

  it('should close the sidebar when clicking anywhere outside it', async () => {
    await withDesktopWidth(async () => {
      const user = userEvent.setup();

      render(<App />);

      const button = await screen.findByRole('button', { name: 'Global navigation' });
      expect(button.getAttribute('aria-expanded')).toBe('true');

      const main = document.getElementById('primary-app-container');
      await user.click(main as HTMLElement);

      expect(button.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('should not close the sidebar when clicking inside it', async () => {
    await withDesktopWidth(async () => {
      const user = userEvent.setup();

      render(<App />);

      const button = await screen.findByRole('button', { name: 'Global navigation' });
      expect(button.getAttribute('aria-expanded')).toBe('true');

      const sidebar = document.getElementById('page-sidebar');
      await user.click(sidebar as HTMLElement);

      expect(button.getAttribute('aria-expanded')).toBe('true');
    });
  });
});
