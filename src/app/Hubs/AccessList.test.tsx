import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessList } from './AccessList';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumAccess: vi.fn(),
    DeleteAccess: vi.fn(),
    SetAccessList: vi.fn(),
  },
}));

const enumAccess = api.EnumAccess as unknown as Mock;
const deleteAccess = api.DeleteAccess as unknown as Mock;
const setAccessList = api.SetAccessList as unknown as Mock;

const rule = {
  Id_u32: 1,
  Note_utf: 'block guests',
  Active_bool: true,
  Priority_u32: 100,
  Discard_bool: true,
  IsIPv6_bool: false,
  Protocol_u32: 6,
  SrcIpAddress_ip: '0.0.0.0',
  SrcSubnetMask_ip: '0.0.0.0',
  DestIpAddress_ip: '10.0.0.5',
  DestSubnetMask_ip: '255.255.255.255',
};

describe('AccessList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists rules with action, protocol and endpoints', async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });

    render(<AccessList hub="DEFAULT" />);

    expect(await screen.findByText('block guests')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
    expect(screen.getByText('TCP')).toBeInTheDocument();
    expect(screen.getByText('any')).toBeInTheDocument(); // source 0.0.0.0/0
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument(); // dest /32
  });

  it('shows an empty state when there are no rules', async () => {
    enumAccess.mockResolvedValue({ AccessList: [] });

    render(<AccessList hub="DEFAULT" />);

    expect(await screen.findByText('No access list rules')).toBeInTheDocument();
  });

  it('toggles a rule active state via SetAccessList (whole list)', async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    setAccessList.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText('block guests');
    await user.click(screen.getByLabelText('Rule 1 active'));

    const sent = setAccessList.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.AccessList[0]).toMatchObject({ Id_u32: 1, Active_bool: false });
  });

  it('deletes a rule after confirmation', async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    deleteAccess.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText('block guests');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Delete'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteAccess.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Id_u32: 1 });
    expect(enumAccess).toHaveBeenCalledTimes(2);
  });
});
