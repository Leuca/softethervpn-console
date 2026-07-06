import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Properties } from './Properties';
import { api } from '@app/utils/vpnrpc_settings';

let serverUser = 'Administrator';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetHub: vi.fn(),
    SetHub: vi.fn(),
    GetHubMsg: vi.fn(),
    SetHubMsg: vi.fn(),
    GetHubAdminOptions: vi.fn(),
    GetDefaultHubAdminOptions: vi.fn(),
    SetHubAdminOptions: vi.fn(),
    GetHubExtOptions: vi.fn(),
    SetHubExtOptions: vi.fn(),
    GetAcList: vi.fn(),
    SetAcList: vi.fn(),
  },
}));

vi.mock('@app/ServerContext', () => ({
  useServer: () => ({
    user: serverUser,
    capsList: [
      { CapsName_str: 'b_support_hub_admin_option', CapsValue_u32: 1 },
      { CapsName_str: 'b_support_ipv6_ac', CapsValue_u32: 1 },
    ],
  }),
}));

const getHub = api.GetHub as unknown as Mock;
const setHub = api.SetHub as unknown as Mock;
const getHubMsg = api.GetHubMsg as unknown as Mock;
const getHubAdminOptions = api.GetHubAdminOptions as unknown as Mock;
const getDefaultHubAdminOptions = api.GetDefaultHubAdminOptions as unknown as Mock;
const setHubAdminOptions = api.SetHubAdminOptions as unknown as Mock;
const getHubExtOptions = api.GetHubExtOptions as unknown as Mock;
const setHubExtOptions = api.SetHubExtOptions as unknown as Mock;
const getAcList = api.GetAcList as unknown as Mock;
const setAcList = api.SetAcList as unknown as Mock;

// GetHub is not relied on to echo HubName_str; the save sets it from the prop.
const hubConfig = {
  Online_bool: true,
  HubType_u32: 0,
  MaxSession_u32: 0,
  NoEnum_bool: false,
};

describe('Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverUser = 'Administrator';
    getHubMsg.mockResolvedValue({ Msg_bin: new Uint8Array() });
    getHubAdminOptions.mockResolvedValue({
      AdminOptionList: [
        {
          Name_str: 'allow_hub_admin_change_option',
          Value_u32: 0,
          Descrption_utf: 'Allow hub admins to change admin options.',
        },
        { Name_str: 'max_users', Value_u32: 25, Descrption_utf: 'Maximum users.' },
        { Name_str: 'no_change_users', Value_u32: 1, Descrption_utf: 'Deny user changes.' },
      ],
    });
    getDefaultHubAdminOptions.mockResolvedValue({
      AdminOptionList: [
        {
          Name_str: 'allow_hub_admin_change_option',
          Value_u32: 0,
          Descrption_utf: 'Allow hub admins to change admin options.',
        },
      ],
    });
    getHubExtOptions.mockResolvedValue({
      AdminOptionList: [
        { Name_str: 'NoIpTable', Value_u32: 0, Descrption_utf: 'Do not generate an IP address table.' },
        {
          Name_str: 'BroadcastStormDetectionThreshold',
          Value_u32: 32,
          Descrption_utf: 'Broadcast storm threshold.',
        },
      ],
    });
    getAcList.mockResolvedValue({
      ACList: [
        {
          Id_u32: 1,
          Priority_u32: 100,
          Deny_bool: false,
          Masked_bool: false,
          IpAddress_ip: '192.0.2.10',
          SubnetMask_ip: '',
        },
      ],
    });
  });

  it('loads the hub config and shows current values', async () => {
    getHub.mockResolvedValue({ ...hubConfig, MaxSession_u32: 10 });

    render(<Properties hub="DEFAULT" />);

    expect(await screen.findByLabelText('Max sessions')).toHaveValue(10);
    expect(screen.getByRole('button', { name: 'Set the Message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extended Options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Source IP Access Control' })).toBeInTheDocument();
    expect(getHub.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('saves changes and keeps the password when the field is blank', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setHub.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    const maxSession = await screen.findByLabelText('Max sessions');
    await user.clear(maxSession);
    await user.type(maxSession, '5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setHub.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.MaxSession_u32).toBe(5);
    // whole object round-tripped so online/type survive
    expect(sent.HubType_u32).toBe(0);
    // password not changed -> key omitted
    expect(Object.prototype.hasOwnProperty.call(sent, 'AdminPasswordPlainText_str')).toBe(false);
  });

  it('sends a new password when one is entered', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setHub.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.type(await screen.findByLabelText('New admin password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setHub.mock.calls[0][0].AdminPasswordPlainText_str).toBe('hunter2');
  });

  it('loads hub administration options', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await screen.findByLabelText('Max sessions');
    expect(getHubAdminOptions).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Administration Options' }));
    const adminDialog = await screen.findByRole('dialog', { name: 'Virtual Hub Administration Options' });

    expect(await within(adminDialog).findByText('allow_hub_admin_change_option')).toBeInTheDocument();
    expect(within(adminDialog).getByText('Allow hub admins to change admin options.')).toBeInTheDocument();
    expect(getHubAdminOptions.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(getDefaultHubAdminOptions.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an error when hub administration options fail to load', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    getHubAdminOptions.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Administration Options' }));

    expect(await screen.findByText('Could not load or save hub administration options')).toBeInTheDocument();
  });

  it('edits hub administration options inline before saving', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setHubAdminOptions.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Administration Options' }));
    const adminDialog = await screen.findByRole('dialog', { name: 'Virtual Hub Administration Options' });

    expect(within(adminDialog).queryByRole('button', { name: 'Add option' })).not.toBeInTheDocument();
    expect(within(adminDialog).queryByRole('button', { name: /kebab toggle/i })).not.toBeInTheDocument();

    await user.click(await within(adminDialog).findByLabelText('Value for allow_hub_admin_change_option'));
    await user.click(within(adminDialog).getByLabelText('Value for no_change_users'));

    const maxUsers = within(adminDialog).getByLabelText('Value for max_users');
    await user.clear(maxUsers);
    await user.type(maxUsers, '50');

    await user.click(within(adminDialog).getByRole('button', { name: 'Save options' }));

    const sent = setHubAdminOptions.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.AdminOptionList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Name_str: 'allow_hub_admin_change_option', Value_u32: 1 }),
        expect.objectContaining({ Name_str: 'max_users', Value_u32: 50 }),
        expect.objectContaining({ Name_str: 'no_change_users', Value_u32: 0 }),
      ]),
    );
  });

  it('loads hub extended options', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await screen.findByLabelText('Max sessions');
    expect(getHubExtOptions).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Extended Options' }));
    const extDialog = await screen.findByRole('dialog', { name: 'Virtual Hub Extended Options' });

    expect(await within(extDialog).findByText('NoIpTable')).toBeInTheDocument();
    expect(within(extDialog).getByText('Do not generate an IP address table.')).toBeInTheDocument();
    expect(getHubExtOptions.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(getHubAdminOptions.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an error when hub extended options fail to load', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    getHubExtOptions.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Extended Options' }));

    expect(await screen.findByText('Could not load or save hub extended options')).toBeInTheDocument();
  });

  it('edits hub extended options inline before saving', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setHubExtOptions.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Extended Options' }));
    const extDialog = await screen.findByRole('dialog', { name: 'Virtual Hub Extended Options' });

    await user.click(await within(extDialog).findByLabelText('Value for NoIpTable'));
    const threshold = within(extDialog).getByLabelText('Value for BroadcastStormDetectionThreshold');
    await user.clear(threshold);
    await user.type(threshold, '64');

    await user.click(within(extDialog).getByRole('button', { name: 'Save options' }));

    const sent = setHubExtOptions.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.AdminOptionList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Name_str: 'NoIpTable', Value_u32: 1 }),
        expect.objectContaining({ Name_str: 'BroadcastStormDetectionThreshold', Value_u32: 64 }),
      ]),
    );
  });

  it('keeps hub extended options read-only when hub admins are denied', async () => {
    serverUser = 'Hub Administrator';
    getHub.mockResolvedValue({ ...hubConfig });
    getHubAdminOptions.mockResolvedValue({
      AdminOptionList: [
        {
          Name_str: 'deny_hub_admin_change_ext_option',
          Value_u32: 1,
          Descrption_utf: 'Deny hub admins changing extended options.',
        },
      ],
    });
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Extended Options' }));
    const extDialog = await screen.findByRole('dialog', { name: 'Virtual Hub Extended Options' });

    expect(await within(extDialog).findByText('Options are read-only')).toBeInTheDocument();
    expect(within(extDialog).getByRole('button', { name: 'Save options' })).toBeDisabled();
    expect(within(extDialog).getByLabelText('Value for NoIpTable')).toBeDisabled();
  });

  it('loads source IP access control rules', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await screen.findByLabelText('Max sessions');
    expect(getAcList).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Source IP Access Control' }));
    const acDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });

    expect(await within(acDialog).findByText('192.0.2.10')).toBeInTheDocument();
    expect(within(acDialog).getByText('Allow')).toBeInTheDocument();
    expect(getAcList.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(getHubAdminOptions.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an error when source IP access control fails to load', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    getAcList.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Source IP Access Control' }));

    expect(await screen.findByText('Could not load or save source IP access control')).toBeInTheDocument();
  });

  it('adds and saves source IP access control rules', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setAcList.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Source IP Access Control' }));
    const acDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });
    await within(acDialog).findByText('192.0.2.10');

    await user.click(within(acDialog).getByRole('button', { name: 'Add rule' }));
    const ruleDialog = await screen.findByRole('dialog', { name: 'Source IP rule' });
    await user.selectOptions(within(ruleDialog).getByLabelText('Action'), 'deny');
    await user.type(within(ruleDialog).getByLabelText('IP address'), '198.51.100.25');
    await user.click(within(ruleDialog).getByRole('button', { name: 'Add rule' }));

    const updatedDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });
    expect(await within(updatedDialog).findByText('198.51.100.25')).toBeInTheDocument();
    await user.click(within(updatedDialog).getByRole('button', { name: 'Save rules' }));

    const sent = setAcList.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.ACList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ IpAddress_ip: '192.0.2.10', Deny_bool: false, Priority_u32: 100 }),
        expect.objectContaining({ IpAddress_ip: '198.51.100.25', Deny_bool: true, Priority_u32: 200 }),
      ]),
    );
  });

  it('converts IPv6 prefix masks before saving source IP access control rules', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    getAcList.mockResolvedValue({ ACList: [] });
    setAcList.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Source IP Access Control' }));
    const acDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });
    await within(acDialog).findByText('No source IP access control rules');

    await user.click(within(acDialog).getByRole('button', { name: 'Add rule' }));
    const ruleDialog = await screen.findByRole('dialog', { name: 'Source IP rule' });
    await user.click(within(ruleDialog).getByLabelText('IPv6'));
    await user.click(within(ruleDialog).getByLabelText('Subnet'));
    await user.type(within(ruleDialog).getByLabelText('IP address'), '2001:db8::');
    await user.type(within(ruleDialog).getByLabelText('Subnet mask'), '/64');
    await user.click(within(ruleDialog).getByRole('button', { name: 'Add rule' }));

    const updatedDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });
    await user.click(within(updatedDialog).getByRole('button', { name: 'Save rules' }));

    expect(setAcList.mock.calls[0][0].ACList).toEqual([
      expect.objectContaining({
        IpAddress_ip: '2001:db8::',
        SubnetMask_ip: 'ffff:ffff:ffff:ffff:0:0:0:0',
        Masked_bool: true,
      }),
    ]);
  });

  it('edits and deletes source IP access control rules before saving', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setAcList.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Source IP Access Control' }));
    const acDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });
    await within(acDialog).findByText('192.0.2.10');

    await user.click(within(acDialog).getByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));
    const editDialog = await screen.findByRole('dialog', { name: 'Source IP rule' });
    const priority = within(editDialog).getByLabelText('Priority');
    await user.clear(priority);
    await user.type(priority, '50');
    await user.click(within(editDialog).getByLabelText('Subnet'));
    await user.type(within(editDialog).getByLabelText('Subnet mask'), '255.255.255.0');
    await user.click(within(editDialog).getByRole('button', { name: 'Save rule' }));

    const updatedDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });
    expect(await within(updatedDialog).findByText('192.0.2.10/255.255.255.0')).toBeInTheDocument();
    await user.click(within(updatedDialog).getByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Delete'));
    const deleteDialog = await screen.findByRole('dialog', { name: 'Delete source IP rule' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    const afterDeleteDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });
    expect(within(afterDeleteDialog).queryByText('192.0.2.10/255.255.255.0')).not.toBeInTheDocument();

    await user.click(within(afterDeleteDialog).getByRole('button', { name: 'Save rules' }));
    expect(setAcList.mock.calls[0][0].ACList).toEqual([]);
  });

  it('keeps source IP access control read-only when hub admins are denied', async () => {
    serverUser = 'Hub Administrator';
    getHub.mockResolvedValue({ ...hubConfig });
    getHubAdminOptions.mockResolvedValue({
      AdminOptionList: [
        {
          Name_str: 'no_change_access_control_list',
          Value_u32: 1,
          Descrption_utf: 'Deny access control list changes.',
        },
      ],
    });
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.click(await screen.findByRole('button', { name: 'Source IP Access Control' }));
    const acDialog = await screen.findByRole('dialog', { name: 'Source IP Access Control' });

    expect(await within(acDialog).findByText('Rules are read-only')).toBeInTheDocument();
    expect(within(acDialog).getByRole('button', { name: 'Add rule' })).toBeDisabled();
    expect(within(acDialog).getByRole('button', { name: 'Save rules' })).toBeDisabled();
  });
});
