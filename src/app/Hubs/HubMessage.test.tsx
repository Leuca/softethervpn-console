import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubMessage } from './HubMessage';
import { api } from '@app/utils/vpnrpc_settings';

let serverUser = 'Administrator';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetHubMsg: vi.fn(), SetHubMsg: vi.fn(), GetHubAdminOptions: vi.fn() },
}));

vi.mock('@app/ServerContext', () => ({
  useServer: () => ({ user: serverUser }),
}));

const getHubMsg = api.GetHubMsg as unknown as Mock;
const setHubMsg = api.SetHubMsg as unknown as Mock;
const getHubAdminOptions = api.GetHubAdminOptions as unknown as Mock;

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('HubMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverUser = 'Administrator';
    getHubAdminOptions.mockResolvedValue({ AdminOptionList: [] });
  });

  it('loads the current hub message', async () => {
    getHubMsg.mockResolvedValue({ Msg_bin: bytes('Maintenance at 22:00') });
    const user = userEvent.setup();

    render(<HubMessage hub="DEFAULT" />);

    await user.click(screen.getByRole('button', { name: 'Set the Message' }));
    await waitFor(() => expect(screen.getByLabelText('Show Message')).toBeChecked());
    expect(screen.getByLabelText('Message')).toHaveValue('Maintenance at 22:00');
    expect(getHubMsg.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(getHubAdminOptions.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('loads an empty message as disabled', async () => {
    getHubMsg.mockResolvedValue({ Msg_bin: new Uint8Array() });
    const user = userEvent.setup();

    render(<HubMessage hub="DEFAULT" />);

    await user.click(screen.getByRole('button', { name: 'Set the Message' }));
    expect(await screen.findByLabelText('Show Message')).not.toBeChecked();
    expect(screen.getByLabelText('Message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows load errors', async () => {
    getHubMsg.mockRejectedValue(new Error('rpc failed'));
    const user = userEvent.setup();

    render(<HubMessage hub="DEFAULT" />);

    await user.click(screen.getByRole('button', { name: 'Set the Message' }));
    expect(await screen.findByText('Hub message operation failed')).toBeInTheDocument();
    expect(screen.getByText('Error: rpc failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves a new enabled message as bytes', async () => {
    getHubMsg.mockResolvedValue({ Msg_bin: new Uint8Array() });
    setHubMsg.mockResolvedValue({});
    const user = userEvent.setup();

    render(<HubMessage hub="DEFAULT" />);

    await user.click(screen.getByRole('button', { name: 'Set the Message' }));
    await screen.findByLabelText('Show Message');
    await user.click(screen.getByLabelText('Show Message'));
    await user.type(screen.getByLabelText('Message'), 'Welcome');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setHubMsg.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(Array.from(sent.Msg_bin)).toEqual(Array.from(bytes('Welcome')));
  });

  it('blocks saving an enabled empty message', async () => {
    getHubMsg.mockResolvedValue({ Msg_bin: new Uint8Array() });
    const user = userEvent.setup();

    render(<HubMessage hub="DEFAULT" />);

    await user.click(screen.getByRole('button', { name: 'Set the Message' }));
    await user.click(await screen.findByLabelText('Show Message'));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables the message by sending empty bytes', async () => {
    getHubMsg.mockResolvedValue({ Msg_bin: bytes('Old message') });
    setHubMsg.mockResolvedValue({});
    const user = userEvent.setup();

    render(<HubMessage hub="DEFAULT" />);

    await user.click(screen.getByRole('button', { name: 'Set the Message' }));
    await waitFor(() => expect(screen.getByLabelText('Show Message')).toBeChecked());
    await user.click(screen.getByLabelText('Show Message'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setHubMsg.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.Msg_bin).toHaveLength(0);
  });

  it('keeps the message read-only when hub admins are denied', async () => {
    serverUser = 'Hub Administrator';
    getHubMsg.mockResolvedValue({ Msg_bin: bytes('Read only') });
    getHubAdminOptions.mockResolvedValue({
      AdminOptionList: [
        {
          Name_str: 'no_change_msg',
          Value_u32: 1,
          Descrption_utf: 'Deny hub admins changing the client connection message.',
        },
      ],
    });
    const user = userEvent.setup();

    render(<HubMessage hub="DEFAULT" />);

    await user.click(screen.getByRole('button', { name: 'Set the Message' }));

    expect(await screen.findByText('Message is read-only')).toBeInTheDocument();
    expect(screen.getByLabelText('Show Message')).toBeDisabled();
    expect(screen.getByLabelText('Message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(setHubMsg).not.toHaveBeenCalled();
  });
});
