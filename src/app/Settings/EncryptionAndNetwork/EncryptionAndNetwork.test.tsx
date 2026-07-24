import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import forge from 'node-forge';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { EncryptionNetwork } from './EncryptionAndNetwork';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    SetServerPassword: vi.fn(),
    GetServerCert: vi.fn(),
    SetServerCert: vi.fn(),
    RegenerateServerCert: vi.fn(),
    GetServerCipher: vi.fn(),
    SetServerCipher: vi.fn(),
    GetKeep: vi.fn(),
    SetKeep: vi.fn(),
    GetSysLog: vi.fn(),
    SetSysLog: vi.fn(),
    GetSpecialListener: vi.fn(),
    SetSpecialListener: vi.fn(),
  },
}));

const m = (name: keyof typeof api) => api[name] as unknown as Mock;

const card = (title: string) => screen.getByText(title).closest('.pf-v6-c-card') as HTMLElement;

const setup = () => {
  m('GetServerCert').mockResolvedValue({ Cert_bin: '' });
  m('GetServerCipher').mockResolvedValue({ String_str: 'AES256-GCM-SHA384' });
  m('GetKeep').mockResolvedValue({ UseKeepConnect_bool: false, KeepConnectHost_str: 'keepalive.softether.org', KeepConnectPort_u32: 80, KeepConnectProtocol_u32: 0, KeepConnectInterval_u32: 50 });
  m('GetSysLog').mockResolvedValue({ SaveType_u32: 0, Hostname_str: '', Port_u32: 514 });
  m('GetSpecialListener').mockResolvedValue({ VpnOverIcmpListener_bool: false, VpnOverDnsListener_bool: false });
};

const pkcs12File = (password: string) => {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const attributes = [{ name: 'commonName', value: 'vpn.example.com' }];
  cert.setSubject(attributes);
  cert.setIssuer(attributes);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const pfx = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
    generateLocalKeyId: true,
  });
  const der = forge.asn1.toDer(pfx).getBytes();
  const bytes = new Uint8Array(der.length);
  for (let index = 0; index < der.length; index += 1) {
    bytes[index] = der.charCodeAt(index);
  }
  return new File([bytes.buffer], 'server.p12', { type: 'application/x-pkcs12' });
};

describe('EncryptionNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('changes the administrator password once the confirmation matches', async () => {
    m('SetServerPassword').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const pw = card('Server administrator password');
    const changePassword = within(pw).getByRole('button', { name: 'Change password' });
    expect(changePassword).toBeDisabled();

    await user.type(within(pw).getByLabelText('New password'), 's3cret');
    expect(changePassword).toBeDisabled();

    await user.type(within(pw).getByLabelText('Confirm password'), 'nope');
    expect(within(pw).getByText('The passwords do not match.')).toBeInTheDocument();
    expect(changePassword).toBeDisabled();

    await user.clear(within(pw).getByLabelText('Confirm password'));
    await user.type(within(pw).getByLabelText('Confirm password'), 's3cret');
    expect(changePassword).toBeEnabled();
    await user.click(changePassword);

    await waitFor(() => expect(m('SetServerPassword')).toHaveBeenCalledTimes(1));
    expect(m('SetServerPassword').mock.calls[0][0].PlainTextPassword_str).toBe('s3cret');
  });

  it('saves the selected cipher', async () => {
    m('SetServerCipher').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const c = card('Encryption algorithm');
    expect(await within(c).findByLabelText('Cipher')).toHaveValue('AES256-GCM-SHA384');
    await user.selectOptions(within(c).getByLabelText('Cipher'), 'ECDHE-RSA-CHACHA20-POLY1305');
    await user.click(within(c).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m('SetServerCipher')).toHaveBeenCalledTimes(1));
    expect(m('SetServerCipher').mock.calls[0][0].String_str).toBe('ECDHE-RSA-CHACHA20-POLY1305');
  });

  it('enables and saves keep-alive', async () => {
    m('SetKeep').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const c = card('Keep alive internet connection');
    await within(c).findByRole('switch');
    // host disabled until enabled
    expect(within(c).getByLabelText('Keep-alive host name')).toBeDisabled();
    await user.click(within(c).getByRole('switch'));
    expect(within(c).getByLabelText('Keep-alive host name')).toBeEnabled();
    await user.click(within(c).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m('SetKeep')).toHaveBeenCalledTimes(1));
    expect(m('SetKeep').mock.calls[0][0].UseKeepConnect_bool).toBe(true);
  });

  it('saves the syslog save type', async () => {
    m('SetSysLog').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const c = card('Syslog');
    await within(c).findByLabelText('Syslog save type');
    await user.selectOptions(within(c).getByLabelText('Syslog save type'), '2');
    await user.type(within(c).getByLabelText('Syslog host name'), 'logs.example.com');
    await user.click(within(c).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m('SetSysLog')).toHaveBeenCalledTimes(1));
    expect(m('SetSysLog').mock.calls[0][0].SaveType_u32).toBe(2);
  });

  it('blocks saving syslog with an empty host and defaults the port to 514', async () => {
    // server returns an enabled save type with no host and port 0
    m('GetSysLog').mockResolvedValue({ SaveType_u32: 1, Hostname_str: '', Port_u32: 0 });
    m('SetSysLog').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const c = card('Syslog');
    // port 0 was seeded to the standard 514
    expect(await within(c).findByLabelText('Syslog port')).toHaveValue(514);
    // empty host: error shown and Save disabled
    expect(within(c).getByText('Enter the syslog server host name.')).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(within(c).getByLabelText('Syslog host name'), 'logs.example.com');
    expect(within(c).getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(within(c).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m('SetSysLog')).toHaveBeenCalledTimes(1));
    const sent = m('SetSysLog').mock.calls[0][0];
    expect(sent.Hostname_str).toBe('logs.example.com');
    expect(sent.Port_u32).toBe(514);
  });

  it('toggles and saves VPN over ICMP/DNS', async () => {
    m('SetSpecialListener').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const c = card('VPN over ICMP / DNS');
    await user.click(await within(c).findByRole('switch', { name: /VPN over ICMP/i }));
    await user.click(within(c).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m('SetSpecialListener')).toHaveBeenCalledTimes(1));
    expect(m('SetSpecialListener').mock.calls[0][0].VpnOverIcmpListener_bool).toBe(true);
  });

  it('regenerates the server certificate with the given CN', async () => {
    m('RegenerateServerCert').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const c = card('Server SSL certificate');
    await user.click(await within(c).findByRole('button', { name: /Regenerate self-signed/i }));
    await user.type(await screen.findByLabelText('Common name'), 'vpn.example.com');
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => expect(m('RegenerateServerCert')).toHaveBeenCalledTimes(1));
    expect(m('RegenerateServerCert').mock.calls[0][0].StrValue_str).toBe('vpn.example.com');
  });

  it('decrypts and imports a PKCS #12 certificate in the browser', async () => {
    m('SetServerCert').mockResolvedValue({});
    const user = userEvent.setup();
    render(<EncryptionNetwork />);

    const c = card('Server SSL certificate');
    await within(c).findByLabelText('Certificate or PKCS #12 file name');
    const fileInput = c.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, pkcs12File('archive-secret'));
    await user.type(within(c).getByLabelText('PKCS #12 archive password'), 'archive-secret');

    const importButton = within(c).getByRole('button', { name: 'Import certificate' });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    await waitFor(() => expect(m('SetServerCert')).toHaveBeenCalledTimes(1));
    const sent = m('SetServerCert').mock.calls[0][0];
    expect(new TextDecoder().decode(sent.Cert_bin)).toContain('BEGIN CERTIFICATE');
    expect(sent.Key_bin[0]).toBe(0x30);
    expect(() =>
      forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(String.fromCharCode(...sent.Key_bin))),
    ).not.toThrow();
    expect(JSON.stringify(sent)).not.toContain('archive-secret');
    expect(within(c).queryByLabelText('PKCS #12 archive password')).not.toBeInTheDocument();
  });
});
