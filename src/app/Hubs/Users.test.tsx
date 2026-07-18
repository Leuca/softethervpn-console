import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    // new accounts must not expire: ExpireTime is the epoch-era "never" sentinel
    expect(new Date(createUser.mock.calls[0][0].ExpireTime_dt).getUTCFullYear()).toBeLessThanOrEqual(1970);
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

  it('creates a user authenticated by a registered certificate', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    createUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /new user/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('User name'), 'cert-user');
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), '2');
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();

    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File([SELF_SIGNED_CERT_DER()], 'user.cer', { type: 'application/x-x509-ca-cert' }));
    expect(await within(dialog).findByRole('button', { name: 'View registered certificate' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const sent = createUser.mock.calls[0][0];
    expect(sent).toMatchObject({ Name_str: 'cert-user', AuthType_u32: 2 });
    expect(sent.UserX_bin).toBeInstanceOf(Uint8Array);
    expect(sent.UserX_bin.length).toBeGreaterThan(0);
  });

  it.each([
    ['RADIUS', '4', 'RADIUS username', 'RadiusUsername_utf', 'radius-user'],
    ['NT domain', '5', 'NT domain username', 'NtUsername_utf', 'nt-user'],
  ])('creates a user with %s authentication', async (_label, authValue, fieldLabel, payloadKey, fieldValue) => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    createUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /new user/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('User name'), 'external-user');
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), authValue);
    await user.type(within(dialog).getByLabelText(fieldLabel), fieldValue);
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(createUser.mock.calls[0][0]).toMatchObject({
      Name_str: 'external-user',
      AuthType_u32: Number(authValue),
      [payloadKey]: fieldValue,
    });
  });

  it('creates a root-certificate user with optional common name and serial constraints', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    createUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /new user/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('User name'), 'root-user');
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), '3');
    const create = within(dialog).getByRole('button', { name: 'Create' });
    expect(create).toBeEnabled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Set common name (CN)' }));
    expect(create).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Common name'), 'cert-user.example.com');
    expect(create).toBeEnabled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Set serial number' }));
    expect(create).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Serial number'), '0G');
    expect(create).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Serial number'));
    await user.type(within(dialog).getByLabelText('Serial number'), '01 AB');
    expect(create).toBeEnabled();

    await user.click(create);

    const sent = createUser.mock.calls[0][0];
    expect(sent).toMatchObject({
      Name_str: 'root-user',
      AuthType_u32: 3,
      CommonName_utf: 'cert-user.example.com',
    });
    expect(Array.from(sent.Serial_bin)).toEqual([1, 171]);
  });

  it('creates a user with group, expiration and security policy settings', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    createUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /new user/i }));

    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('User name'), 'managed-user');
    await user.type(within(dialog).getByLabelText('Group'), 'sales');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Account expires' }));
    const expiration = await within(dialog).findByLabelText('Expiration date');
    fireEvent.change(expiration, { target: { value: '2027-03-04' } });

    await user.click(within(dialog).getByRole('button', { name: 'Add security policy' }));
    expect(await screen.findByText('Security policy: managed-user')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /apply a security policy/i }));
    await user.click(screen.getByRole('switch', { name: 'Deny bridge operation' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const sent = createUser.mock.calls[0][0];
    expect(sent).toMatchObject({
      Name_str: 'managed-user',
      GroupName_str: 'sales',
      UsePolicy_bool: true,
      'policy:Access_bool': true,
      'policy:NoBridge_bool': true,
    });
    expect(new Date(sent.ExpireTime_dt).toISOString()).toBe('2027-03-04T00:00:00.000Z');
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

  it('keeps edited values open when the server rejects the save', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({ Name_str: 'alice', Realname_utf: 'Alice A', AuthType_u32: 1 });
    setUser.mockRejectedValue(new Error('Update rejected'));
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

    expect(await within(dialog).findByText('User operation failed')).toBeInTheDocument();
    expect(realname).toHaveValue('Alice B');
  });

  it('disables edit save again when user fields return to their original values', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({ Name_str: 'alice', Realname_utf: 'Alice A', Note_utf: '', AuthType_u32: 1 });
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save' });
    const realname = within(dialog).getByLabelText('Real name');
    expect(save).toBeDisabled();

    await user.clear(realname);
    await user.type(realname, 'Alice B');
    expect(save).toBeEnabled();

    await user.clear(realname);
    await user.type(realname, 'Alice A');
    expect(save).toBeDisabled();

    await user.type(within(dialog).getByLabelText('New password'), 'newpass');
    expect(save).toBeEnabled();
    await user.clear(within(dialog).getByLabelText('New password'));
    expect(save).toBeDisabled();
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

  it('edits root-certificate serial constraints', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({
      HubName_str: 'DEFAULT',
      Name_str: 'alice',
      AuthType_u32: 3,
      CommonName_utf: 'alice.example.com',
      Serial_bin: btoa(String.fromCharCode(1, 171)),
    });
    setUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Set common name (CN)' })).toBeChecked();
    expect(within(dialog).getByLabelText('Serial number')).toHaveValue('01 AB');

    await user.click(within(dialog).getByRole('checkbox', { name: 'Set serial number' }));
    expect(save).toBeEnabled();
    await user.click(save);

    const sent = setUser.mock.calls[0][0];
    expect(sent.CommonName_utf).toBe('alice.example.com');
    expect(sent.Serial_bin).toBeInstanceOf(Uint8Array);
    expect(sent.Serial_bin.length).toBe(0);
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
    const note = within(dialog).getByLabelText('Note');
    await user.type(note, 'keep cert');
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

  it('edits the security policy and sends it with the user on save', async () => {
    enumUser.mockResolvedValue({ UserList: [alice] });
    getUser.mockResolvedValue({
      Name_str: 'alice',
      AuthType_u32: 1,
      UsePolicy_bool: false,
      'policy:Access_bool': true,
      'policy:NoBridge_bool': false,
    });
    setUser.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Users hub="DEFAULT" />);
    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByText('Edit'));

    await user.click(await screen.findByRole('button', { name: 'Add security policy' }));
    expect(await screen.findByText('Security policy: alice')).toBeInTheDocument();
    await user.click(await screen.findByRole('switch', { name: /apply a security policy/i }));
    await user.click(screen.getByRole('switch', { name: 'Deny bridge operation' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setUser.mock.calls[0][0];
    expect(sent.UsePolicy_bool).toBe(true);
    expect(sent['policy:NoBridge_bool']).toBe(true);
    expect(sent['policy:Access_bool']).toBe(true);
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
