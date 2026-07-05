import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cascade } from './Cascade';
import { api } from '@app/utils/vpnrpc_settings';
import { hashSoftEtherPassword } from '@app/utils/sha0';
import { SELF_SIGNED_CERT_DER } from '@app/utils/x509.fixture';

// Fill the four always-required fields of the create form.
async function fillCommonFields(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByLabelText('Setting name'), 'to-hq');
  await user.type(within(dialog).getByLabelText('Destination server host'), 'hq.example.com');
  await user.type(within(dialog).getByLabelText('Destination virtual hub'), 'HQ');
}

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumLink: vi.fn(),
    CreateLink: vi.fn(),
    GetLink: vi.fn(),
    SetLink: vi.fn(),
    SetLinkOnline: vi.fn(),
    SetLinkOffline: vi.fn(),
    DeleteLink: vi.fn(),
    GetLinkStatus: vi.fn(),
  },
}));

const enumLink = api.EnumLink as unknown as Mock;
const createLink = api.CreateLink as unknown as Mock;
const getLink = api.GetLink as unknown as Mock;
const setLink = api.SetLink as unknown as Mock;
const setLinkOnline = api.SetLinkOnline as unknown as Mock;
const setLinkOffline = api.SetLinkOffline as unknown as Mock;
const deleteLink = api.DeleteLink as unknown as Mock;
const getLinkStatus = api.GetLinkStatus as unknown as Mock;

const connectedLink = {
  AccountName_utf: 'to-branch',
  Online_bool: true,
  Connected_bool: true,
  LastError_u32: 0,
  ConnectedTime_dt: '2026-07-04T09:00:00.000Z',
  Hostname_str: 'branch.example.com',
  TargetHubName_str: 'BRANCH',
};

describe('Cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists cascades with a connected status and destination', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });

    render(<Cascade hub="DEFAULT" />);

    expect(await screen.findByText('to-branch')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('branch.example.com')).toBeInTheDocument();
    expect(screen.getByText('BRANCH')).toBeInTheDocument();
    expect(enumLink.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an offline status label', async () => {
    enumLink.mockResolvedValue({
      LinkList: [{ ...connectedLink, Online_bool: false, Connected_bool: false }],
    });

    render(<Cascade hub="DEFAULT" />);

    expect(await screen.findByText('Offline')).toBeInTheDocument();
  });

  it('shows an empty state when the hub has no cascades', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });

    render(<Cascade hub="DEFAULT" />);

    expect(await screen.findByText('No cascade connections')).toBeInTheDocument();
  });

  it('shows an error when enumeration fails', async () => {
    enumLink.mockRejectedValue(new Error('boom'));

    render(<Cascade hub="DEFAULT" />);

    expect(await screen.findByText('Cascade operation failed')).toBeInTheDocument();
  });

  it('creates an anonymous cascade with the local and destination hub set correctly', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    createLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Setting name'), 'to-hq');
    await user.type(within(dialog).getByLabelText('Destination server host'), 'hq.example.com');
    await user.clear(within(dialog).getByLabelText('Port'));
    await user.type(within(dialog).getByLabelText('Port'), '992');
    await user.type(within(dialog).getByLabelText('Destination virtual hub'), 'HQ');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(createLink).toHaveBeenCalledOnce();
    expect(createLink.mock.calls[0][0]).toMatchObject({
      HubName_Ex_str: 'DEFAULT', // local hub
      HubName_str: 'HQ', // destination hub
      AccountName_utf: 'to-hq',
      Hostname_str: 'hq.example.com',
      Port_u32: 992,
      Online_bool: true,
    });
  });

  it('offers all four client-auth methods including RADIUS/NT and certificate', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    const authSelect = within(dialog).getByLabelText('Authentication method');
    expect(within(authSelect).getByRole('option', { name: 'Anonymous' })).toBeInTheDocument();
    expect(within(authSelect).getByRole('option', { name: 'Standard password' })).toBeInTheDocument();
    expect(within(authSelect).getByRole('option', { name: /RADIUS \/ NT domain/ })).toBeInTheDocument();
    expect(within(authSelect).getByRole('option', { name: 'Client certificate' })).toBeInTheDocument();
  });

  it('requires a password for password-based auth', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), 'Standard password');
    await user.type(within(dialog).getByLabelText('Username'), 'alice');

    // Username present but no password yet: Create stays disabled.
    const createBtn = within(dialog).getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Password'), 'secret');
    expect(createBtn).toBeEnabled();
  });

  it('hashes the password for standard (SHA-0) auth', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    createLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), 'Standard password');
    await user.type(within(dialog).getByLabelText('Username'), 'alice');
    await user.type(within(dialog).getByLabelText('Password'), 'secret');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const sent = createLink.mock.calls[0][0];
    expect(sent.AuthType_u32).toBe(1); // SHA0_Hashed_Password
    expect(sent.Username_str).toBe('alice');
    expect(Array.from(sent.HashedPassword_bin)).toEqual(Array.from(hashSoftEtherPassword('alice', 'secret')));
  });

  it('sends a plain password for RADIUS/NT domain auth', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    createLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.selectOptions(
      within(dialog).getByLabelText('Authentication method'),
      'RADIUS / NT domain (plain password)',
    );
    await user.type(within(dialog).getByLabelText('Username'), 'bob');
    await user.type(within(dialog).getByLabelText('Password'), 'plain-pass');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const sent = createLink.mock.calls[0][0];
    expect(sent.AuthType_u32).toBe(2); // PlainPassword
    expect(sent.Username_str).toBe('bob');
    expect(sent.PlainPassword_str).toBe('plain-pass');
    expect(sent.HashedPassword_bin.length).toBe(0);
  });

  it('creates a certificate cascade with the cert and key bytes', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    createLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), 'Client certificate');
    await user.type(within(dialog).getByLabelText('Username'), 'carol');

    const fileInputs = dialog.querySelectorAll('input[type="file"]');
    await user.upload(
      fileInputs[0] as HTMLInputElement,
      new File([SELF_SIGNED_CERT_DER()], 'client.cer', { type: 'application/x-x509-ca-cert' }),
    );
    await user.upload(
      fileInputs[1] as HTMLInputElement,
      new File([new Uint8Array([1, 2, 3, 4])], 'client.key', { type: 'application/octet-stream' }),
    );

    const createBtn = within(dialog).getByRole('button', { name: 'Create' });
    await waitFor(() => expect(createBtn).toBeEnabled());
    await user.click(createBtn);

    const sent = createLink.mock.calls[0][0];
    expect(sent.AuthType_u32).toBe(3); // Cert
    expect(sent.Username_str).toBe('carol');
    expect(sent.ClientX_bin).toBeInstanceOf(Uint8Array);
    expect(sent.ClientX_bin.length).toBeGreaterThan(0);
    expect(Array.from(sent.ClientK_bin)).toEqual([1, 2, 3, 4]);
  });

  it('rejects an encrypted private key with a clear error', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.selectOptions(within(dialog).getByLabelText('Authentication method'), 'Client certificate');
    await user.type(within(dialog).getByLabelText('Username'), 'carol');

    const fileInputs = dialog.querySelectorAll('input[type="file"]');
    await user.upload(
      fileInputs[0] as HTMLInputElement,
      new File([SELF_SIGNED_CERT_DER()], 'client.cer', { type: 'application/x-x509-ca-cert' }),
    );
    const encryptedKey = '-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIF...\n-----END ENCRYPTED PRIVATE KEY-----\n';
    await user.upload(
      fileInputs[1] as HTMLInputElement,
      new File([encryptedKey], 'client.key', { type: 'application/octet-stream' }),
    );

    expect(await within(dialog).findByText(/Encrypted .*private keys are not supported/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('creates a cascade that verifies and pins the server certificate', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    createLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    // Anonymous auth (default) -> the only file input is the pinned server cert.
    await user.click(within(dialog).getByLabelText('Always verify the destination server certificate'));
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      fileInput,
      new File([SELF_SIGNED_CERT_DER()], 'server.cer', { type: 'application/x-x509-ca-cert' }),
    );
    await within(dialog).findByRole('button', { name: 'View certificate' });
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const sent = createLink.mock.calls[0][0];
    expect(sent.CheckServerCert_bool).toBe(true);
    expect(sent.ServerCert_bin).toBeInstanceOf(Uint8Array);
    expect(sent.ServerCert_bin.length).toBeGreaterThan(0);
  });

  it('changes a cascade auth method when editing', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 0, // anonymous
      Username_str: '',
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText('Authentication method'),
      'RADIUS / NT domain (plain password)',
    );
    await user.type(within(dialog).getByLabelText('Username'), 'newuser');
    await user.type(within(dialog).getByLabelText('Password'), 'newpass');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const sent = setLink.mock.calls[0][0];
    expect(sent.AuthType_u32).toBe(2);
    expect(sent.Username_str).toBe('newuser');
    expect(sent.PlainPassword_str).toBe('newpass');
  });

  it('rehashes the password when editing standard-password auth', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 1, // SHA0 standard password
      Username_str: 'alice',
      HashedPassword_bin: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=', // 20 bytes, an existing secret
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Password'), 'newsecret');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const sent = setLink.mock.calls[0][0];
    expect(Array.from(sent.HashedPassword_bin)).toEqual(Array.from(hashSoftEtherPassword('alice', 'newsecret')));
  });

  it('keeps the existing password when the edit password is left blank', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 2, // plain password
      Username_str: 'bob',
      PlainPassword_str: 'keepme',
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    const dialog = await screen.findByRole('dialog');
    // Change only the destination host; leave the password blank.
    const hostField = within(dialog).getByLabelText('Destination server host');
    await user.clear(hostField);
    await user.type(hostField, 'new.example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const sent = setLink.mock.calls[0][0];
    expect(sent.PlainPassword_str).toBe('keepme');
    expect(sent.Hostname_str).toBe('new.example.com');
  });

  it('toggles server-certificate verification when editing', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 0,
      Username_str: '',
      CheckServerCert_bool: false,
      ServerCert_bin: '',
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Always verify the destination server certificate'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(setLink.mock.calls[0][0].CheckServerCert_bool).toBe(true);
  });

  it('applies advanced tuning options on create', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    createLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: /advanced settings/i }));

    const maxConn = within(dialog).getByLabelText('Number of TCP connections');
    await user.clear(maxConn);
    await user.type(maxConn, '4');
    await user.click(within(dialog).getByLabelText('Compress the data'));
    await user.click(within(dialog).getByLabelText('Encrypt the VPN communication')); // default on -> off
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const sent = createLink.mock.calls[0][0];
    expect(sent.MaxConnection_u32).toBe(4);
    expect(sent.UseCompress_bool).toBe(true);
    expect(sent.UseEncrypt_bool).toBe(false);
  });

  it('edits advanced tuning options', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 0,
      MaxConnection_u32: 1,
      UseEncrypt_bool: true,
      UseCompress_bool: false,
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /advanced settings/i }));
    const maxConn = within(dialog).getByLabelText('Number of TCP connections');
    await user.clear(maxConn);
    await user.type(maxConn, '8');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(setLink.mock.calls[0][0].MaxConnection_u32).toBe(8);
  });

  it('creates a cascade through an HTTP proxy', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    createLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: /^proxy$/i }));
    await user.selectOptions(within(dialog).getByLabelText('Proxy type'), 'HTTP proxy');
    await user.type(within(dialog).getByLabelText('Proxy host'), 'proxy.example.com');
    await user.type(within(dialog).getByLabelText('Proxy port'), '8080');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    const sent = createLink.mock.calls[0][0];
    expect(sent.ProxyType_u32).toBe(1); // HTTP
    expect(sent.ProxyName_str).toBe('proxy.example.com');
    expect(sent.ProxyPort_u32).toBe(8080);
  });

  it('blocks create when a proxy is selected without a host', async () => {
    enumLink.mockResolvedValue({ LinkList: [] });
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('No cascade connections');
    await user.click(screen.getAllByRole('button', { name: /new cascade/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await fillCommonFields(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: /^proxy$/i }));
    await user.selectOptions(within(dialog).getByLabelText('Proxy type'), 'SOCKS proxy');

    // Host/port missing: Create disabled.
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('edits proxy settings', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 0,
      ProxyType_u32: 0,
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^proxy$/i }));
    await user.selectOptions(within(dialog).getByLabelText('Proxy type'), 'HTTP proxy');
    await user.type(within(dialog).getByLabelText('Proxy host'), 'p.example.com');
    await user.type(within(dialog).getByLabelText('Proxy port'), '3128');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const sent = setLink.mock.calls[0][0];
    expect(sent.ProxyType_u32).toBe(1);
    expect(sent.ProxyName_str).toBe('p.example.com');
    expect(sent.ProxyPort_u32).toBe(3128);
  });

  it('edits the security policy of a cascade', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 0,
      UsePolicy_bool: false,
      'policy:Access_bool': true,
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    await user.click(await screen.findByRole('button', { name: 'Add security policy' }));
    expect(await screen.findByText('Cascade security policy')).toBeInTheDocument();
    await user.click(await screen.findByRole('switch', { name: /apply a security policy/i }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Back on the edit modal, save.
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    const sent = setLink.mock.calls[0][0];
    expect(sent.UsePolicy_bool).toBe(true);
    expect(sent['policy:Access_bool']).toBe(true);
  });

  it('sets an online cascade offline', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    setLinkOffline.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Set offline' }));

    expect(setLinkOffline).toHaveBeenCalledOnce();
    expect(setLinkOffline.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', AccountName_utf: 'to-branch' });
  });

  it('sets an offline cascade online', async () => {
    enumLink.mockResolvedValue({
      LinkList: [{ ...connectedLink, Online_bool: false, Connected_bool: false }],
    });
    setLinkOnline.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Set online' }));

    expect(setLinkOnline).toHaveBeenCalledOnce();
    expect(setLinkOnline.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', AccountName_utf: 'to-branch' });
  });

  it('inspects and edits an existing cascade, preserving auth on save', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLink.mockResolvedValue({
      HubName_Ex_str: 'DEFAULT',
      AccountName_utf: 'to-branch',
      Hostname_str: 'branch.example.com',
      Port_u32: 443,
      HubName_str: 'BRANCH',
      AuthType_u32: 2, // PlainPassword (RADIUS/NT)
      Username_str: 'bob',
      PlainPassword_str: 'secret',
      CheckServerCert_bool: false,
      ProxyType_u32: 0,
      MaxConnection_u32: 1,
      UseEncrypt_bool: true,
      UseCompress_bool: false,
      HashedPassword_bin: '',
      ClientX_bin: '',
      ClientK_bin: '',
      ServerCert_bin: '',
    });
    setLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit settings' }));

    const dialog = await screen.findByRole('dialog');
    // Auth is now editable and prefilled from GetLink.
    expect(within(dialog).getByLabelText('Authentication method')).toHaveValue('2'); // PlainPassword
    expect(within(dialog).getByLabelText('Username')).toHaveValue('bob');

    const hostField = within(dialog).getByLabelText('Destination server host');
    await user.clear(hostField);
    await user.type(hostField, 'new.example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(getLink.mock.calls[0][0]).toMatchObject({ HubName_Ex_str: 'DEFAULT', AccountName_utf: 'to-branch' });
    const sent = setLink.mock.calls[0][0];
    expect(sent.Hostname_str).toBe('new.example.com');
    expect(sent.HubName_Ex_str).toBe('DEFAULT');
    // Auth preserved by round-tripping the full object.
    expect(sent.AuthType_u32).toBe(2);
    expect(sent.Username_str).toBe('bob');
    expect(sent.PlainPassword_str).toBe('secret');
  });

  it('opens the connection status modal', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    getLinkStatus.mockResolvedValue({ Connected_bool: true, ServerName_str: 'branch.example.com', ServerPort_u32: 443 });
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Connection status' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('branch.example.com')).toBeInTheDocument();
    expect(getLinkStatus.mock.calls[0][0]).toMatchObject({ HubName_Ex_str: 'DEFAULT', AccountName_utf: 'to-branch' });
  });

  it('deletes a cascade after confirmation', async () => {
    enumLink.mockResolvedValue({ LinkList: [connectedLink] });
    deleteLink.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Cascade hub="DEFAULT" />);
    await screen.findByText('to-branch');
    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteLink).toHaveBeenCalledOnce();
    expect(deleteLink.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', AccountName_utf: 'to-branch' });
  });
});
