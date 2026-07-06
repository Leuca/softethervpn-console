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
  },
}));

vi.mock('@app/ServerContext', () => ({
  useServer: () => ({
    user: serverUser,
    capsList: [{ CapsName_str: 'b_support_hub_admin_option', CapsValue_u32: 1 }],
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
  });

  it('loads the hub config and shows current values', async () => {
    getHub.mockResolvedValue({ ...hubConfig, MaxSession_u32: 10 });

    render(<Properties hub="DEFAULT" />);

    expect(await screen.findByLabelText('Max sessions')).toHaveValue(10);
    expect(screen.getByRole('button', { name: 'Set the Message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extended Options' })).toBeInTheDocument();
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
});
