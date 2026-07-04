import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusteringStatus } from './ClusteringStatus';
import { api } from '@app/utils/vpnrpc_settings';
import { SELF_SIGNED_CERT_B64 } from '@app/utils/x509.fixture';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetFarmSetting: vi.fn(),
    EnumFarmMember: vi.fn(),
    GetFarmInfo: vi.fn(),
    GetFarmConnectionStatus: vi.fn(),
  },
}));

const getFarmSetting = api.GetFarmSetting as unknown as Mock;
const enumFarmMember = api.EnumFarmMember as unknown as Mock;
const getFarmInfo = api.GetFarmInfo as unknown as Mock;
const getFarmConnectionStatus = api.GetFarmConnectionStatus as unknown as Mock;

// VpnRpcServerType: Standalone 0, FarmController 1, FarmMember 2
describe('ClusteringStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the member list on a cluster controller', async () => {
    getFarmSetting.mockResolvedValue({ ServerType_u32: 1 });
    enumFarmMember.mockResolvedValue({
      FarmMemberList: [
        {
          Id_u32: 10,
          Controller_bool: true,
          Hostname_str: 'controller.example',
          ConnectedTime_dt: '2026-07-03T10:00:00.000Z',
          Point_u32: 100,
          NumSessions_u32: 5,
          NumTcpConnections_u32: 7,
          NumHubs_u32: 2,
          AssignedClientLicense_u32: 1000,
          AssignedBridgeLicense_u32: 100,
        },
      ],
    });

    render(<ClusteringStatus />);

    const row = (await screen.findByText('controller.example')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Controller')).toBeInTheDocument();
    // license numbers get thousands separators
    expect(within(row).getByText('1,000')).toBeInTheDocument();
  });

  it('opens the member detail modal via GetFarmInfo', async () => {
    getFarmSetting.mockResolvedValue({ ServerType_u32: 1 });
    enumFarmMember.mockResolvedValue({
      FarmMemberList: [
        {
          Id_u32: 42,
          Controller_bool: false,
          Hostname_str: 'member.example',
          ConnectedTime_dt: '2026-07-03T10:00:00.000Z',
          Point_u32: 90,
          NumSessions_u32: 1,
          NumTcpConnections_u32: 1,
          NumHubs_u32: 1,
          AssignedClientLicense_u32: 500,
          AssignedBridgeLicense_u32: 50,
        },
      ],
    });
    getFarmInfo.mockResolvedValue({
      Id_u32: 42,
      Point_u32: 55,
      ServerCert_bin: SELF_SIGNED_CERT_B64, // RPC returns _bin fields as base64 strings
      HubsList: [{ HubName_str: 'DEFAULT', DynamicHub_bool: true }],
    });
    const user = userEvent.setup();

    render(<ClusteringStatus />);
    await screen.findByText('member.example');

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'View details' }));

    expect(await screen.findByText('Member: member.example')).toBeInTheDocument();
    expect(getFarmInfo).toHaveBeenCalledTimes(1);
    expect(getFarmInfo.mock.calls[0][0].Id_u32).toBe(42);
    // hub label rendered from HubsList
    expect(screen.getByText('DEFAULT (Dynamic)')).toBeInTheDocument();

    // the server certificate can now be viewed
    await user.click(screen.getByRole('button', { name: 'View server certificate' }));
    expect(await screen.findByText('Certificate: test.example.com')).toBeInTheDocument();
    expect(screen.getByText('Self-signed')).toBeInTheDocument();
  });

  it('shows the controller connection status on a cluster member', async () => {
    getFarmSetting.mockResolvedValue({ ServerType_u32: 2 });
    getFarmConnectionStatus.mockResolvedValue({ Online_bool: true, NumConnected_u32: 3 });

    render(<ClusteringStatus />);

    expect(await screen.findByText('Num Connected')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(enumFarmMember).not.toHaveBeenCalled();
  });

  it('shows a standalone empty state when not clustered', async () => {
    getFarmSetting.mockResolvedValue({ ServerType_u32: 0 });

    render(<ClusteringStatus />);

    expect(await screen.findByText('Standalone server')).toBeInTheDocument();
  });

  it('shows an error when the role cannot be determined', async () => {
    getFarmSetting.mockRejectedValue(new Error('boom'));

    render(<ClusteringStatus />);

    expect(await screen.findByText('Could not determine the cluster role')).toBeInTheDocument();
  });

  it('shows an error when the member list fails to load', async () => {
    getFarmSetting.mockResolvedValue({ ServerType_u32: 1 });
    enumFarmMember.mockRejectedValue(new Error('nope'));

    render(<ClusteringStatus />);

    await waitFor(() => expect(screen.getByText('Could not load cluster members')).toBeInTheDocument());
  });
});
