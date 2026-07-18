import * as React from 'react';
import App from '@app/index';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, afterEach, describe, expect, it, test, vi } from 'vitest';
import { api } from '@app/utils/vpnrpc_settings';

// The server probes performed on mount cannot reach a real VPN server in tests;
// return a small supported-server shape so the app settles without console
// warnings.
vi.mock('@app/utils/vpnrpc_settings', () => {
  return {
    api: {
      EnumConnection: vi.fn(() => Promise.resolve({})),
      GetFarmSetting: vi.fn(() => Promise.resolve({ ServerType_u32: 0 })),
      GetDDnsClientStatus: vi.fn(() => Promise.resolve({ CurrentHostName_str: 'vpn.example.test' })),
      GetAzureStatus: vi.fn(() => Promise.resolve({ IsEnabled_bool: false })),
      GetCaps: vi.fn(() =>
        Promise.resolve({
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
      })),
      GetServerInfo: vi.fn(() =>
        Promise.resolve({
        ServerType_u32: 0,
        ServerProductName_str: 'SoftEther VPN Server',
        ServerVersionString_str: 'Version 5.02',
        ServerHostName_str: 'vpn.example.test',
      })),
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
  const enumConnection = api.EnumConnection as unknown as Mock;
  const getCaps = api.GetCaps as unknown as Mock;
  const getFarmSetting = api.GetFarmSetting as unknown as Mock;
  const defaultCaps = {
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
  };

  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

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

  it('should keep the sidebar open when clicking desktop content', async () => {
    await withDesktopWidth(async () => {
      const user = userEvent.setup();

      render(<App />);

      const button = await screen.findByRole('button', { name: 'Global navigation' });
      expect(button.getAttribute('aria-expanded')).toBe('true');

      const main = document.getElementById('primary-app-container');
      await user.click(main as HTMLElement);

      expect(button.getAttribute('aria-expanded')).toBe('true');
    });
  });

  it('should close the mobile sidebar when clicking outside it', async () => {
    const user = userEvent.setup();

    render(<App />);

    const button = await screen.findByRole('button', { name: 'Global navigation' });
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    const main = document.getElementById('primary-app-container');
    await user.click(main as HTMLElement);

    expect(button.getAttribute('aria-expanded')).toBe('false');
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

  it('should close the sidebar when the page enters mobile view', async () => {
    await withDesktopWidth(async () => {
      const resizeCallbacks: ResizeObserverCallback[] = [];
      const originalResizeObserver = window.ResizeObserver;

      window.ResizeObserver = class ResizeObserver {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();

        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
      };

      try {
        render(<App />);

        const button = await screen.findByRole('button', { name: 'Global navigation' });
        expect(button.getAttribute('aria-expanded')).toBe('true');

        vi.useFakeTimers();
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 });
        act(() => {
          resizeCallbacks.forEach((callback) =>
            callback([{} as ResizeObserverEntry], undefined as unknown as ResizeObserver),
          );
        });
        act(() => vi.advanceTimersByTime(250));

        expect(button.getAttribute('aria-expanded')).toBe('false');
      } finally {
        vi.useRealTimers();
        window.ResizeObserver = originalResizeObserver;
      }
    });
  });

  it('redirects unauthorized users to permission notice on direct protected URLs', async () => {
    enumConnection.mockRejectedValueOnce(new Error('Error: Code=52, Message=Error code 52: Not enough privileges.'));
    window.history.pushState({}, '', '/#/settings/listeners');

    render(<App />);

    expect(await screen.findByText('Permission required')).toBeVisible();
    expect(await screen.findByText(/server administrator privileges/i)).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Take me home' })).toBeVisible();
  });

  it('shows capability-based route-denial reason on direct functional URLs', async () => {
    getCaps.mockResolvedValueOnce({
      ...defaultCaps,
      caps_b_local_bridge_u32: 0,
    });

    window.history.pushState({}, '', '/#/functionalities/localbridge');

    render(<App />);

    expect(await screen.findByText('Permission required')).toBeVisible();
    expect(
      await screen.findByText(/Local Bridge is not available with this server's capabilities/i),
    ).toBeVisible();
  });

  it('denies functionalities pages to hub administrators on direct URLs', async () => {
    // The Functionalities group is admin-only at group level; the flattened
    // routes must inherit that flag so RouteGate matches the nav.
    enumConnection.mockRejectedValueOnce(new Error('Error: Code=52, Message=Error code 52: Not enough privileges.'));
    window.history.pushState({}, '', '/#/functionalities/localbridge');

    render(<App />);

    expect(await screen.findByText('Permission required')).toBeVisible();
    expect(await screen.findByText(/server administrator privileges/i)).toBeVisible();
  });

  it('denies the EtherIP detail page in bridge mode on direct URLs', async () => {
    getCaps.mockResolvedValueOnce({
      ...defaultCaps,
      caps_b_bridge_u32: 1,
    });

    window.history.pushState({}, '', '/#/functionalities/legacyprotocols/etherip');

    render(<App />);

    expect(await screen.findByText('Permission required')).toBeVisible();
    expect(await screen.findByText(/This page is unavailable in bridge mode/i)).toBeVisible();
  });

  it('keeps clustering configuration reachable in cluster mode', async () => {
    // Cluster members must still reach the page to change or leave clustering.
    getFarmSetting.mockResolvedValue({ ServerType_u32: 1 });

    window.history.pushState({}, '', '/#/settings/clusterconfig');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Clustering Configuration', level: 1 })).toBeVisible();
    expect(screen.queryByText('Permission required')).not.toBeInTheDocument();
  });
});
