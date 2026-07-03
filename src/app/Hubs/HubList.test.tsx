import * as React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubList } from './HubList';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumHub: vi.fn(),
    SetHubOnline: vi.fn(),
    CreateHub: vi.fn(),
    DeleteHub: vi.fn(),
  },
}));

// HubList reads the server type from the ServerContext to decide the hub type
// on creation; a standalone server is enough for these tests.
vi.mock('@app/ServerContext', () => ({
  useServer: () => ({ info: { ServerType_u32: 0 } }),
}));

const enumHub = api.EnumHub as unknown as Mock;
const setHubOnline = api.SetHubOnline as unknown as Mock;
const createHub = api.CreateHub as unknown as Mock;
const deleteHub = api.DeleteHub as unknown as Mock;

const defaultHub = {
  HubName_str: 'DEFAULT',
  Online_bool: true,
  HubType_u32: 0,
  NumUsers_u32: 3,
  NumGroups_u32: 0,
  NumSessions_u32: 2,
  NumMacTables_u32: 0,
  NumIpTables_u32: 0,
  NumLogin_u32: 5,
  LastLoginTime_dt: '2026-07-03T17:17:54.000Z',
  LastCommTime_dt: '2026-07-03T17:17:54.000Z',
};

function renderList() {
  return render(
    <MemoryRouter>
      <HubList />
    </MemoryRouter>,
  );
}

describe('HubList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a hub row with type label and counts', async () => {
    enumHub.mockResolvedValue({ HubList: [defaultHub] });

    renderList();

    expect(await screen.findByText('DEFAULT')).toBeInTheDocument();
    expect(screen.getByText('Standalone')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // users
  });

  it('shows an empty state when there are no hubs', async () => {
    enumHub.mockResolvedValue({ HubList: [] });

    renderList();

    expect(await screen.findByText('No Virtual Hubs')).toBeInTheDocument();
  });

  it('takes a hub offline through the dedicated SetHubOnline API', async () => {
    enumHub.mockResolvedValue({ HubList: [defaultHub] });
    setHubOnline.mockResolvedValue({});
    const user = userEvent.setup();

    renderList();
    const toggle = await screen.findByLabelText('DEFAULT online');
    await user.click(toggle);

    expect(setHubOnline).toHaveBeenCalledOnce();
    expect(setHubOnline.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Online_bool: false });
  });

  it('disables Create until a name is set and the passwords match', async () => {
    enumHub.mockResolvedValue({ HubList: [defaultHub] });
    const user = userEvent.setup();

    renderList();
    await screen.findByText('DEFAULT');
    await user.click(screen.getByRole('button', { name: /create virtual hub/i }));

    const dialog = await screen.findByRole('dialog');
    const create = within(dialog).getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Virtual Hub name'), 'sales');
    await user.type(within(dialog).getByLabelText('Administrator password'), 'secret');
    await user.type(within(dialog).getByLabelText('Confirm password'), 'different');
    expect(within(dialog).getByText('Passwords do not match.')).toBeInTheDocument();
    expect(create).toBeDisabled();

    await user.clear(within(dialog).getByLabelText('Confirm password'));
    await user.type(within(dialog).getByLabelText('Confirm password'), 'secret');
    expect(create).toBeEnabled();
  });

  it('creates a hub with the entered name and password', async () => {
    enumHub.mockResolvedValue({ HubList: [defaultHub] });
    createHub.mockResolvedValue({});
    const user = userEvent.setup();

    renderList();
    await screen.findByText('DEFAULT');
    await user.click(screen.getByRole('button', { name: /create virtual hub/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Virtual Hub name'), 'sales');
    await user.type(within(dialog).getByLabelText('Administrator password'), 'secret');
    await user.type(within(dialog).getByLabelText('Confirm password'), 'secret');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(createHub).toHaveBeenCalledOnce();
    expect(createHub.mock.calls[0][0]).toMatchObject({
      HubName_str: 'sales',
      AdminPasswordPlainText_str: 'secret',
      HubType_u32: 0,
    });
  });

  it('deletes a hub after confirmation', async () => {
    enumHub.mockResolvedValue({ HubList: [defaultHub] });
    deleteHub.mockResolvedValue({});
    const user = userEvent.setup();

    renderList();
    await screen.findByText('DEFAULT');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Delete'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteHub).toHaveBeenCalledOnce();
    expect(deleteHub.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(enumHub).toHaveBeenCalledTimes(2);
  });
});
