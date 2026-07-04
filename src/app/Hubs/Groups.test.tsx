import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Groups } from './Groups';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumGroup: vi.fn(),
    CreateGroup: vi.fn(),
    DeleteGroup: vi.fn(),
    GetGroup: vi.fn(),
    SetGroup: vi.fn(),
  },
}));

const enumGroup = api.EnumGroup as unknown as Mock;
const createGroup = api.CreateGroup as unknown as Mock;
const deleteGroup = api.DeleteGroup as unknown as Mock;
const getGroup = api.GetGroup as unknown as Mock;
const setGroup = api.SetGroup as unknown as Mock;

const sales = { Name_str: 'sales', Realname_utf: 'Sales team', Note_utf: '', NumUsers_u32: 2, DenyAccess_bool: false };

describe('Groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists groups with their user count', async () => {
    enumGroup.mockResolvedValue({ GroupList: [sales] });

    render(<Groups hub="DEFAULT" />);

    expect(await screen.findByText('sales')).toBeInTheDocument();
    expect(screen.getByText('Sales team')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(enumGroup.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an empty state when the hub has no groups', async () => {
    enumGroup.mockResolvedValue({ GroupList: [] });

    render(<Groups hub="DEFAULT" />);

    expect(await screen.findByText('No groups')).toBeInTheDocument();
  });

  it('creates a group', async () => {
    enumGroup.mockResolvedValue({ GroupList: [sales] });
    createGroup.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Groups hub="DEFAULT" />);
    await screen.findByText('sales');
    await user.click(screen.getByRole('button', { name: /new group/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Group name'), 'ops');
    await user.type(within(dialog).getByLabelText('Real name'), 'Operations');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(createGroup.mock.calls[0][0]).toMatchObject({
      HubName_str: 'DEFAULT',
      Name_str: 'ops',
      Realname_utf: 'Operations',
    });
  });

  it('edits a group name-less (real name / note) and saves', async () => {
    enumGroup.mockResolvedValue({ GroupList: [sales] });
    // GetGroup may not echo HubName_str; the save must still target the hub.
    getGroup.mockResolvedValue({ Name_str: 'sales', Realname_utf: 'Sales team', Note_utf: '' });
    setGroup.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Groups hub="DEFAULT" />);
    await screen.findByText('sales');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    const note = within(dialog).getByLabelText('Note');
    await user.type(note, 'EMEA');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(setGroup.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Name_str: 'sales', Note_utf: 'EMEA' });
  });

  it('edits the security policy and sends it with the group on save', async () => {
    enumGroup.mockResolvedValue({ GroupList: [sales] });
    getGroup.mockResolvedValue({
      Name_str: 'sales',
      Realname_utf: '',
      Note_utf: '',
      UsePolicy_bool: false,
      'policy:Access_bool': true,
      'policy:NoRouting_bool': false,
    });
    setGroup.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Groups hub="DEFAULT" />);
    await screen.findByText('sales');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    await user.click(await screen.findByRole('button', { name: 'Add security policy' }));
    expect(await screen.findByText('Security policy: sales')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /apply a security policy/i }));
    await user.click(screen.getByRole('switch', { name: 'Deny routing operation (IPv4)' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setGroup.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.UsePolicy_bool).toBe(true);
    expect(sent['policy:NoRouting_bool']).toBe(true);
  });

  it('deletes a group after confirmation', async () => {
    enumGroup.mockResolvedValue({ GroupList: [sales] });
    deleteGroup.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Groups hub="DEFAULT" />);
    await screen.findByText('sales');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Delete'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteGroup.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Name_str: 'sales' });
    expect(enumGroup).toHaveBeenCalledTimes(2);
  });
});
