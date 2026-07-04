import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Users } from './Users';
import { api } from '@app/utils/vpnrpc_settings';
import { SELF_SIGNED_CERT_B64, SELF_SIGNED_CERT_DER } from '@app/utils/x509.fixture';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumUser: vi.fn(),
    CreateUser: vi.fn(),
    DeleteUser: vi.fn(),
    GetUser: vi.fn(),
    SetUser: vi.fn(),
  },
}));

const enumUser = api.EnumUser as unknown as Mock;
const createUser = api.CreateUser as unknown as Mock;
const deleteUser = api.DeleteUser as unknown as Mock;
const getUser = api.GetUser as unknown as Mock;
const setUser = api.SetUser as unknown as Mock;

const alice = {
  Name_str: 'alice',
  GroupName_str: '',
  Realname_utf: 'Alice A',
  Note_utf: '',
  AuthType_u32: 1, // Password
  NumLogin_u32: 4,
  LastLoginTime_dt: '2026-07-03T10:00:00.000Z',
  DenyAccess_bool: false,
  Expires_dt: '1970-01-01T09:00:00.000Z', // sentinel -> "Never"
};

describe('Users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists users with auth label and a "Never" expiration', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });

    render(<Users hub="DEFAULT" />);

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(enumUser.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an empty state when the hub has no users', async () => {
    enumUser.mockResolvedValue({ UserList: [] });

    render(<Users hub="DEFAULT" />);

    expect(await screen.findByText('No users')).toBeInTheDocument();
  });

  it('creates an anonymous user', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    createUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /new user/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('User name'), 'bob');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(createUser).toHaveBeenCalledOnce();
    expect(createUser.mock.calls[0][0]).toMatchObject({
      HubName_str: 'DEFAULT',
      Name_str: 'bob',
      AuthType_u32: 0, // Anonymous
    });
  });

  it('reveals the password field and sends the password for password auth', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    createUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /new user/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('User name'), 'carol');
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), '1');
    await user.type(within(dialog).getByLabelText('Password'), 's3cret');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(createUser.mock.calls[0][0]).toMatchObject({
      Name_str: 'carol',
      AuthType_u32: 1,
      Auth_Password_str: 's3cret',
    });
  });

  it('edits a user and keeps the password when the field is blank', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    // GetUser may not echo HubName_str; the save must still target the hub.
    getUser.mockResolvedValue({ Name_str: 'alice', Realname_utf: 'Alice A', AuthType_u32: 1 });
    setUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    const realname = within(dialog).getByLabelText('Real name');
    await user.clear(realname);
    await user.type(realname, 'Alice B');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(setUser).toHaveBeenCalledOnce();
    const sent = setUser.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.Realname_utf).toBe('Alice B');
    // password left blank -> key omitted so the server keeps the current one
    expect(Object.prototype.hasOwnProperty.call(sent, 'Auth_Password_str')).toBe(false);
  });

  it('sends a new password when one is entered while editing', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({ HubName_str: 'DEFAULT', Name_str: 'alice', AuthType_u32: 1 });
    setUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('New password'), 'newpass');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(setUser.mock.calls[0][0].Auth_Password_str).toBe('newpass');
  });

  it('shows the registered certificate for a user-certificate user', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({
      HubName_str: 'DEFAULT',
      Name_str: 'alice',
      AuthType_u32: 2, // UserCert
      UserX_bin: SELF_SIGNED_CERT_B64, // RPC returns _bin fields as base64 strings
    });
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'View registered certificate' }));

    expect(await screen.findByText('Certificate: test.example.com')).toBeInTheDocument();
  });

  it('keeps the existing certificate as bytes when saving without re-upload', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({
      HubName_str: 'DEFAULT',
      Name_str: 'alice',
      AuthType_u32: 2, // UserCert
      UserX_bin: SELF_SIGNED_CERT_B64,
    });
    setUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // Sent as decoded bytes, not the base64 string (which the client would
    // otherwise base64-encode a second time and corrupt).
    const sent = setUser.mock.calls[0][0];
    expect(sent.UserX_bin).toBeInstanceOf(Uint8Array);
    expect(sent.UserX_bin.length).toBe(SELF_SIGNED_CERT_DER().length);
  });

  it('uploads a certificate and sends its bytes on save', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({
      HubName_str: 'DEFAULT',
      Name_str: 'alice',
      AuthType_u32: 2, // UserCert, none registered yet
      UserX_bin: new Uint8Array(),
    });
    setUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'View registered certificate' })).not.toBeInTheDocument();

    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([SELF_SIGNED_CERT_DER()], 'user.cer', { type: 'application/x-x509-ca-cert' });
    await user.upload(fileInput, file);

    // parse succeeded: the view button appears once bytes are staged
    expect(await within(dialog).findByRole('button', { name: 'View registered certificate' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const sent = setUser.mock.calls[0][0];
    expect(sent.UserX_bin).toBeInstanceOf(Uint8Array);
    expect(sent.UserX_bin.length).toBeGreaterThan(0);
  });

  it('deletes a user after confirmation', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    deleteUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Delete'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteUser).toHaveBeenCalledOnce();
    expect(deleteUser.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Name_str: 'alice' });
    expect(enumUser).toHaveBeenCalledTimes(2);
  });
});
