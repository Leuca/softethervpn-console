import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerProvider, useServer } from './ServerContext';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumConnection: vi.fn(),
    GetFarmSetting: vi.fn(),
    GetDDnsClientStatus: vi.fn(),
    GetAzureStatus: vi.fn(),
    GetCaps: vi.fn(),
    GetServerInfo: vi.fn(),
  },
}));

const enumConnection = api.EnumConnection as unknown as Mock;
const getFarmSetting = api.GetFarmSetting as unknown as Mock;
const getDDnsClientStatus = api.GetDDnsClientStatus as unknown as Mock;
const getAzureStatus = api.GetAzureStatus as unknown as Mock;
const getCaps = api.GetCaps as unknown as Mock;
const getServerInfo = api.GetServerInfo as unknown as Mock;

const ProbeState: React.FunctionComponent = () => {
  const { hideAdminOnly, loading, user } = useServer();

  return (
    <>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="user">{user}</span>
      <span data-testid="hide-admin-only">{hideAdminOnly ? 'hidden' : 'visible'}</span>
    </>
  );
};

const renderProvider = () =>
  render(
    <ServerProvider>
      <ProbeState />
    </ServerProvider>,
  );

const mockSuccessfulProbes = () => {
  enumConnection.mockResolvedValue({});
  getFarmSetting.mockResolvedValue({ ServerType_u32: 0 });
  getDDnsClientStatus.mockResolvedValue({ CurrentHostName_str: 'vpn.example.test' });
  getAzureStatus.mockResolvedValue({ IsEnabled_bool: false });
  getCaps.mockResolvedValue({ CapsList: [] });
  getServerInfo.mockResolvedValue({ ServerType_u32: 0 });
};

describe('ServerProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulProbes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects hub administrators without logging the expected privilege probe failure', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    enumConnection.mockRejectedValue(new Error('Error: Code=52, Message=Error code 52: Not enough privileges.'));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    expect(screen.getByTestId('user')).toHaveTextContent('Hub Administrator');
    expect(screen.getByTestId('hide-admin-only')).toHaveTextContent('hidden');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs unexpected probe failures with the probe name', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new Error('probe failed');
    getCaps.mockRejectedValue(error);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Server probe GetCaps failed', error);
  });
});
