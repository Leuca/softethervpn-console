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
    SetLinkOnline: vi.fn(),
    SetLinkOffline: vi.fn(),
    DeleteLink: vi.fn(),
    GetLinkStatus: vi.fn(),
  },
}));

const enumLink = api.EnumLink as unknown as Mock;
const createLink = api.CreateLink as unknown as Mock;
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
