import * as React from 'react';
import App from '@app/index';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, test, vi } from 'vitest';

// The server probes performed on mount cannot reach a real VPN server in tests;
// return a small supported-server shape so the app settles without console
// warnings.
vi.mock('@app/utils/vpnrpc_settings', () => {
  const resolve = <T,>(value: T) => () => Promise.resolve(value);
  return {
    api: {
      EnumConnection: resolve({}),
      GetFarmSetting: resolve({ ServerType_u32: 0 }),
      GetDDnsClientStatus: resolve({ CurrentHostName_str: 'vpn.example.test' }),
      GetAzureStatus: resolve({ IsEnabled_bool: false }),
      GetCaps: resolve({
        CapsList: [],
        caps_b_local_bridge_u32: 1,
        caps_b_support_cluster_u32: 1,
        caps_b_support_layer3_u32: 1,
        caps_b_support_azure_u32: 1,
        caps_b_support_ddns_u32: 1,
        caps_b_support_ipsec_u32: 1,
        caps_b_support_openvpn_u32: 1,
        caps_b_support_sstp_u32: 1,
        caps_b_tap_supported_u32: 1,
        caps_b_bridge_u32: 0,
        caps_b_vpn4_u32: 0,
        caps_b_support_ddns_proxy_u32: 0,
      }),
      GetServerInfo: resolve({
        ServerType_u32: 0,
        ServerProductName_str: 'SoftEther VPN Server',
        ServerVersionString_str: 'Version 5.02',
        ServerHostName_str: 'vpn.example.test',
      }),
    },
  };
});

// PatternFly decides mobile vs desktop from the page element's clientWidth,
// which jsdom reports as 0 (-> "mobile"); the layout also seeds the initial
// sidebar state from window.innerWidth. Stub a desktop width for both for the
// duration of a test so the sidebar starts open and we exercise the desktop path.
async function withDesktopWidth(fn: () => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalInner = window.innerWidth;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1920 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  try {
    await fn();
  } finally {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    }
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInner });
  }
}

describe('App tests', () => {
  test('should render default App component', async () => {
    const { asFragment } = render(<App />);

    expect(asFragment()).toMatchSnapshot();
    await screen.findByRole('button', { name: 'Global navigation' });
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
