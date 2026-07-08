import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureNAT } from './SecureNAT';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetHubStatus: vi.fn(),
    GetSecureNATOption: vi.fn(),
    SetSecureNATOption: vi.fn(),
    EnableSecureNAT: vi.fn(),
    DisableSecureNAT: vi.fn(),
    GetSecureNATStatus: vi.fn(),
    EnumNAT: vi.fn(),
    EnumDHCP: vi.fn(),
  },
}));

// Advertise the caps a supported server would; missing caps gate closed.
const supportedCaps = [{ CapsName_str: 'b_suppport_push_route_config', CapsValue_u32: 1 }];

const serverState = {
  capsList: [] as unknown[],
  hideNonCluster: false,
};

vi.mock('@app/ServerContext', () => ({
  useServer: () => serverState,
}));

const getHubStatus = api.GetHubStatus as unknown as Mock;
const getSecureNATOption = api.GetSecureNATOption as unknown as Mock;
const setSecureNATOption = api.SetSecureNATOption as unknown as Mock;
const enableSecureNAT = api.EnableSecureNAT as unknown as Mock;
const disableSecureNAT = api.DisableSecureNAT as unknown as Mock;
const getSecureNATStatus = api.GetSecureNATStatus as unknown as Mock;
const enumNAT = api.EnumNAT as unknown as Mock;
const enumDHCP = api.EnumDHCP as unknown as Mock;

const option = {
  RpcHubName_str: 'DEFAULT',
  MacAddress_bin: new Uint8Array([0x00, 0xac, 0x00, 0x11, 0x22, 0x33]),
  Ip_ip: '192.168.30.1',
  Mask_ip: '255.255.255.0',
  UseNat_bool: true,
  Mtu_u32: 1500,
  NatTcpTimeout_u32: 1800,
  NatUdpTimeout_u32: 60,
  UseDhcp_bool: true,
  DhcpLeaseIPStart_ip: '192.168.30.10',
  DhcpLeaseIPEnd_ip: '192.168.30.200',
  DhcpSubnetMask_ip: '255.255.255.0',
  DhcpExpireTimeSpan_u32: 7200,
  DhcpGatewayAddress_ip: '192.168.30.1',
  DhcpDnsServerAddress_ip: '192.168.30.1',
  DhcpDnsServerAddress2_ip: '',
  DhcpDomainName_str: 'example.test',
  SaveLog_bool: true,
  ApplyDhcpPushRoutes_bool: false,
  DhcpPushRoutes_str: '',
};

describe('SecureNAT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverState.capsList = [...supportedCaps];
    serverState.hideNonCluster = false;
    getHubStatus.mockResolvedValue({ HubName_str: 'DEFAULT', SecureNATEnabled_bool: false });
    getSecureNATOption.mockResolvedValue({ ...option });
    setSecureNATOption.mockResolvedValue({});
    enableSecureNAT.mockResolvedValue({});
    disableSecureNAT.mockResolvedValue({});
    getSecureNATStatus.mockResolvedValue({
      HubName_str: 'DEFAULT',
      NumTcpSessions_u32: 1,
      NumUdpSessions_u32: 2,
      NumIcmpSessions_u32: 0,
      NumDnsSessions_u32: 1,
      NumDhcpClients_u32: 1,
      IsKernelMode_bool: false,
      IsRawIpMode_bool: false,
    });
    enumNAT.mockResolvedValue({ NatTable: [] });
    enumDHCP.mockResolvedValue({ DhcpTable: [] });
  });

  it('loads Secure NAT settings for the selected hub', async () => {
    render(<SecureNAT hub="DEFAULT" />);

    expect(await screen.findByText('Secure NAT is disabled')).toBeInTheDocument();
    expect(screen.getByLabelText('MAC address')).toHaveValue('00:AC:00:11:22:33');
    expect(screen.getByLabelText('IP address')).toHaveValue('192.168.30.1');
    expect(getHubStatus.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(getSecureNATOption.mock.calls[0][0]).toMatchObject({ RpcHubName_str: 'DEFAULT' });
  });

  it('loads runtime status and tables when Secure NAT is enabled', async () => {
    getHubStatus.mockResolvedValue({ HubName_str: 'DEFAULT', SecureNATEnabled_bool: true });
    enumNAT.mockResolvedValue({
      NatTable: [
        {
          Id_u32: 7,
          Protocol_u32: 0,
          SrcIp_ip: '192.168.30.20',
          SrcPort_u32: 50000,
          DestIp_ip: '198.51.100.10',
          DestPort_u32: 443,
          LastCommTime_dt: '2026-01-02T03:04:05.000Z',
          SendSize_u64: 100,
          RecvSize_u64: 200,
          TcpStatus_u32: 3,
        },
      ],
    });
    enumDHCP.mockResolvedValue({
      DhcpTable: [
        {
          Id_u32: 3,
          LeasedTime_dt: '2026-01-02T03:00:00.000Z',
          ExpireTime_dt: '2026-01-02T05:00:00.000Z',
          MacAddress_bin: new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]),
          IpAddress_ip: '192.168.30.20',
          Hostname_str: 'client1',
        },
      ],
    });

    render(<SecureNAT hub="DEFAULT" />);

    expect(await screen.findByText('Secure NAT is enabled')).toBeInTheDocument();
    expect(await screen.findByText('192.168.30.20:50000')).toBeInTheDocument();
    expect(screen.getByText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
    expect(getSecureNATStatus.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(enumNAT.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(enumDHCP.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('saves a full option payload with a normalized MAC and explicit hub name', async () => {
    const user = userEvent.setup();
    render(<SecureNAT hub="DEFAULT" />);

    await screen.findByText('Secure NAT is disabled');
    await user.clear(screen.getByLabelText('MAC address'));
    await user.type(screen.getByLabelText('MAC address'), '00-ac-00-44-55-66');
    await user.clear(screen.getByLabelText('Gateway address'));
    await user.clear(screen.getByLabelText('Primary DNS server'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setSecureNATOption.mock.calls[0][0];
    expect(sent.RpcHubName_str).toBe('DEFAULT');
    expect(Array.from(sent.MacAddress_bin)).toEqual([0x00, 0xac, 0x00, 0x44, 0x55, 0x66]);
    expect(sent.DhcpGatewayAddress_ip).toBe('0.0.0.0');
    expect(sent.DhcpDnsServerAddress_ip).toBe('0.0.0.0');
    expect(sent.ApplyDhcpPushRoutes_bool).toBe(true);
  });

  it('normalizes the :: secondary DNS sentinel to an empty field', async () => {
    getSecureNATOption.mockResolvedValue({ ...option, DhcpDnsServerAddress2_ip: '::' });
    const user = userEvent.setup();

    render(<SecureNAT hub="DEFAULT" />);

    expect(await screen.findByLabelText('Secondary DNS server')).toHaveValue('');
    expect(screen.queryByText(/Secondary DNS server must be blank or a valid IPv4 address/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setSecureNATOption.mock.calls[0][0].DhcpDnsServerAddress2_ip).toBe('0.0.0.0');
  });

  it('shows 0.0.0.0 secondary DNS as an empty field', async () => {
    getSecureNATOption.mockResolvedValue({ ...option, DhcpDnsServerAddress2_ip: '0.0.0.0' });

    render(<SecureNAT hub="DEFAULT" />);

    expect(await screen.findByLabelText('Secondary DNS server')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('blocks saving when native validation rules fail', async () => {
    const user = userEvent.setup();
    render(<SecureNAT hub="DEFAULT" />);

    await screen.findByText('Secure NAT is disabled');
    await user.clear(screen.getByLabelText('MTU'));
    await user.type(screen.getByLabelText('MTU'), '40');

    expect(screen.getByText(/MTU must be between 64 and 1500/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('enables Secure NAT after confirmation', async () => {
    const user = userEvent.setup();
    render(<SecureNAT hub="DEFAULT" />);

    await screen.findByText('Secure NAT is disabled');
    await user.click(screen.getByRole('button', { name: 'Enable Secure NAT' }));
    await user.click(screen.getByRole('button', { name: 'Enable' }));

    expect(enableSecureNAT.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('disables Secure NAT directly when it is running', async () => {
    getHubStatus.mockResolvedValue({ HubName_str: 'DEFAULT', SecureNATEnabled_bool: true });
    const user = userEvent.setup();

    render(<SecureNAT hub="DEFAULT" />);
    await screen.findByText('Secure NAT is enabled');
    await user.click(screen.getByRole('button', { name: 'Disable Secure NAT' }));

    await waitFor(() => expect(disableSecureNAT).toHaveBeenCalledTimes(1));
    expect(disableSecureNAT.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('disables actions on cluster servers', async () => {
    serverState.hideNonCluster = true;

    render(<SecureNAT hub="DEFAULT" />);

    expect(await screen.findByText('Secure NAT is not available on cluster servers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable Secure NAT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
