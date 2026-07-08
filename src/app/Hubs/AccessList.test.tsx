import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessList } from './AccessList';
import { api } from '@app/utils/vpnrpc_settings';

const serverState = vi.hoisted(() => ({
  capsList: [] as unknown[],
}));

// Advertise the caps a supported server would; missing caps gate closed.
const fullCaps = [
  { CapsName_str: 'b_support_ipv6_acl', CapsValue_u32: 1 },
  { CapsName_str: 'b_support_check_mac', CapsValue_u32: 1 },
  { CapsName_str: 'b_support_check_tcp_state', CapsValue_u32: 1 },
  { CapsName_str: 'b_support_ex_acl', CapsValue_u32: 1 },
  { CapsName_str: 'b_support_redirect_url_acl', CapsValue_u32: 1 },
  { CapsName_str: 'b_support_acl_group', CapsValue_u32: 1 },
  { CapsName_str: 'i_max_access_lists', CapsValue_u32: 4096 },
];

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumAccess: vi.fn(),
    AddAccess: vi.fn(),
    DeleteAccess: vi.fn(),
    SetAccessList: vi.fn(),
  },
}));

vi.mock('@app/ServerContext', () => ({
  useServer: () => serverState,
}));

const enumAccess = api.EnumAccess as unknown as Mock;
const addAccess = api.AddAccess as unknown as Mock;
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
    serverState.capsList = [...fullCaps];
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

  it('creates an IPv4 rule via AddAccess', async () => {
    enumAccess.mockResolvedValue({ AccessList: [] });
    addAccess.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText('No access list rules');
    await user.click(screen.getAllByRole('button', { name: 'New IPv4 rule' })[0]);
    await user.type(screen.getByLabelText('Memo'), 'allow dns');
    await user.selectOptions(screen.getByLabelText('Protocol'), '17');
    await user.type(screen.getByLabelText('Destination port start'), '53');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const sent = addAccess.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.AccessListSingle[0]).toMatchObject({
      Note_utf: 'allow dns',
      Active_bool: true,
      Priority_u32: 1000,
      Discard_bool: false,
      IsIPv6_bool: false,
      SrcIpAddress_ip: '0.0.0.0',
      SrcSubnetMask_ip: '0.0.0.0',
      DestIpAddress_ip: '0.0.0.0',
      DestSubnetMask_ip: '0.0.0.0',
      Protocol_u32: 17,
      DestPortStart_u32: 53,
    });
  });

  it('edits a rule via SetAccessList', async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    setAccessList.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText('block guests');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));
    await user.clear(screen.getByLabelText('Priority'));
    await user.type(screen.getByLabelText('Priority'), '50');
    await user.clear(screen.getByLabelText('Memo'));
    await user.type(screen.getByLabelText('Memo'), 'block tcp service');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setAccessList.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.AccessList[0]).toMatchObject({
      Id_u32: 1,
      Priority_u32: 50,
      Note_utf: 'block tcp service',
      Protocol_u32: 6,
    });
  });

  it('clones a rule via AddAccess with the next unused priority', async () => {
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    addAccess.mockResolvedValue({});
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText('block guests');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Clone'));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const sent = addAccess.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.AccessListSingle[0]).toMatchObject({
      Id_u32: 0,
      Note_utf: 'block guests',
      Priority_u32: 101,
      Discard_bool: true,
      Protocol_u32: 6,
    });
  });

  it('hides unsupported advanced fields from the editor', async () => {
    serverState.capsList = [
      { CapsName_str: 'b_support_ipv6_acl', CapsValue_u32: 0 },
      { CapsName_str: 'b_support_check_mac', CapsValue_u32: 0 },
      { CapsName_str: 'b_support_check_tcp_state', CapsValue_u32: 0 },
      { CapsName_str: 'b_support_ex_acl', CapsValue_u32: 0 },
      { CapsName_str: 'b_support_redirect_url_acl', CapsValue_u32: 0 },
      { CapsName_str: 'b_support_acl_group', CapsValue_u32: 0 },
    ];
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText('block guests');
    expect(screen.getByRole('button', { name: 'New IPv6 rule' })).toBeDisabled();

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    expect(screen.getByLabelText('Source user')).toBeInTheDocument();
    expect(screen.queryByLabelText('Source user or group')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Match source MAC')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Match TCP connection state')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('HTTP redirect URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delay (ms)')).not.toBeInTheDocument();
  });

  it('disables create and clone actions at the access-list limit', async () => {
    serverState.capsList = [{ CapsName_str: 'i_max_access_lists', CapsValue_u32: 1 }];
    enumAccess.mockResolvedValue({ AccessList: [rule] });
    const user = userEvent.setup();

    render(<AccessList hub="DEFAULT" />);
    await screen.findByText('block guests');

    expect(screen.getByRole('button', { name: 'New IPv4 rule' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New IPv6 rule' })).toBeDisabled();

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    expect((await screen.findByText('Clone')).closest('[aria-disabled="true"]')).toBeInTheDocument();
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
