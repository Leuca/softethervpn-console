import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Listeners } from './Listeners';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumListener: vi.fn(),
    CreateListener: vi.fn(),
    DeleteListener: vi.fn(),
    EnableListener: vi.fn(),
  },
}));

const enumListener = api.EnumListener as unknown as Mock;
const createListener = api.CreateListener as unknown as Mock;
const deleteListener = api.DeleteListener as unknown as Mock;
const enableListener = api.EnableListener as unknown as Mock;

const listening = { Ports_u32: 5555, Enables_bool: true, Errors_bool: false };
const stopped = { Ports_u32: 992, Enables_bool: false, Errors_bool: false };

async function openFirstRowMenu() {
  const user = userEvent.setup();
  const kebabs = await screen.findAllByRole('button', { name: /kebab toggle/i });
  await user.click(kebabs[0]);
  return user;
}

describe('Listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders each listener with a status label', async () => {
    enumListener.mockResolvedValue({ ListenerList: [listening, stopped] });

    render(<Listeners />);

    expect(await screen.findByText('TCP 5555')).toBeInTheDocument();
    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.getByText('TCP 992')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('shows an empty state when no listeners exist', async () => {
    enumListener.mockResolvedValue({ ListenerList: [] });

    render(<Listeners />);

    expect(await screen.findByText('No listeners defined')).toBeInTheDocument();
  });

  it('creates a listener on the chosen port and reloads', async () => {
    enumListener.mockResolvedValue({ ListenerList: [listening] });
    createListener.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Listeners />);
    await screen.findByText('TCP 5555');

    await user.click(screen.getByRole('button', { name: /create listener/i }));
    const dialog = await screen.findByRole('dialog');
    // default port is highest + 1 = 5556
    expect(within(dialog).getByLabelText('Port number')).toHaveValue(5556);
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(createListener).toHaveBeenCalledOnce();
    expect(createListener.mock.calls[0][0]).toMatchObject({ Port_u32: 5556, Enable_bool: true });
    expect(enumListener).toHaveBeenCalledTimes(2);
  });

  it('blocks creating a listener on a port already in use', async () => {
    enumListener.mockResolvedValue({ ListenerList: [{ Ports_u32: 1, Enables_bool: true, Errors_bool: false }] });
    const user = userEvent.setup();

    render(<Listeners />);
    await screen.findByText('TCP 1');

    await user.click(screen.getByRole('button', { name: /create listener/i }));
    const dialog = await screen.findByRole('dialog');
    // only port 1 exists, so default becomes 2; type it down to the used port 1
    await user.click(within(dialog).getByRole('button', { name: 'Decrease port' }));
    expect(within(dialog).getByLabelText('Port number')).toHaveValue(1);

    expect(within(dialog).getByText('Port already in use')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('stops a running listener', async () => {
    enumListener.mockResolvedValue({ ListenerList: [listening] });
    enableListener.mockResolvedValue({});

    render(<Listeners />);
    await screen.findByText('TCP 5555');
    const user = await openFirstRowMenu();
    await user.click(await screen.findByText('Stop'));

    expect(enableListener).toHaveBeenCalledOnce();
    expect(enableListener.mock.calls[0][0]).toMatchObject({ Port_u32: 5555, Enable_bool: false });
  });

  it('deletes a listener after confirmation', async () => {
    enumListener.mockResolvedValue({ ListenerList: [listening] });
    deleteListener.mockResolvedValue({});

    render(<Listeners />);
    await screen.findByText('TCP 5555');
    const user = await openFirstRowMenu();
    await user.click(await screen.findByText('Delete'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteListener).toHaveBeenCalledOnce();
    expect(deleteListener.mock.calls[0][0]).toMatchObject({ Port_u32: 5555 });
    expect(enumListener).toHaveBeenCalledTimes(2);
  });
});
