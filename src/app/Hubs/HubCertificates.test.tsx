import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubCertificates } from './HubCertificates';
import { api } from '@app/utils/vpnrpc_settings';
import { SELF_SIGNED_CERT_DER, SELF_SIGNED_CERT_PEM } from '@app/utils/x509.fixture';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    EnumCa: vi.fn(),
    AddCa: vi.fn(),
    GetCa: vi.fn(),
    DeleteCa: vi.fn(),
    EnumCrl: vi.fn(),
    AddCrl: vi.fn(),
    DelCrl: vi.fn(),
    GetCrl: vi.fn(),
    SetCrl: vi.fn(),
  },
}));

const enumCa = api.EnumCa as unknown as Mock;
const addCa = api.AddCa as unknown as Mock;
const getCa = api.GetCa as unknown as Mock;
const deleteCa = api.DeleteCa as unknown as Mock;
const enumCrl = api.EnumCrl as unknown as Mock;
const addCrl = api.AddCrl as unknown as Mock;
const delCrl = api.DelCrl as unknown as Mock;
const getCrl = api.GetCrl as unknown as Mock;
const setCrl = api.SetCrl as unknown as Mock;

const caItem = {
  Key_u32: 7,
  SubjectName_utf: 'CN=Root CA',
  IssuerName_utf: 'CN=Root CA',
  Expires_dt: '2030-01-01T00:00:00.000Z',
};

const bytesB64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

describe('HubCertificates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enumCrl.mockResolvedValue({ CRLList: [] });
  });

  it('lists trusted CA certificates for the hub', async () => {
    enumCa.mockResolvedValue({ CAList: [caItem] });

    render(<HubCertificates hub="DEFAULT" />);

    expect(await screen.findAllByText('CN=Root CA')).toHaveLength(2);
    expect(enumCa.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(enumCrl.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows an empty state when no trusted CA certificates exist', async () => {
    enumCa.mockResolvedValue({ CAList: [] });

    render(<HubCertificates hub="DEFAULT" />);

    expect(await screen.findByText('No trusted CA certificates')).toBeInTheDocument();
  });

  it('adds a trusted CA certificate and normalizes PEM uploads to DER', async () => {
    enumCa.mockResolvedValue({ CAList: [] });
    addCa.mockResolvedValue({});
    const user = userEvent.setup();

    render(<HubCertificates hub="DEFAULT" />);
    await screen.findByText('No trusted CA certificates');

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File([SELF_SIGNED_CERT_PEM()], 'root.pem', { type: 'application/x-pem-file' }));

    await waitFor(() => expect(addCa).toHaveBeenCalledOnce());
    const sent = addCa.mock.calls[0][0];
    expect(sent).toMatchObject({ HubName_str: 'DEFAULT' });
    expect(Array.from(sent.Cert_bin)).toEqual(Array.from(SELF_SIGNED_CERT_DER()));
    expect(enumCa).toHaveBeenCalledTimes(2);
  });

  it('views and deletes a trusted CA certificate', async () => {
    enumCa.mockResolvedValue({ CAList: [caItem] });
    getCa.mockResolvedValue({ Cert_bin: SELF_SIGNED_CERT_DER() });
    deleteCa.mockResolvedValue({});
    const user = userEvent.setup();

    render(<HubCertificates hub="DEFAULT" />);
    await screen.findAllByText('CN=Root CA');

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'View certificate' }));
    await waitFor(() => expect(getCa).toHaveBeenCalledOnce());
    expect(getCa.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Key_u32: 7 });

    const certDialog = await screen.findByRole('dialog');
    expect(within(certDialog).getByText('Certificate: test.example.com')).toBeInTheDocument();
    await user.click(within(certDialog).getByText('Close'));

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const deleteDialog = await screen.findByRole('dialog');
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteCa).toHaveBeenCalledOnce());
    expect(deleteCa.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Key_u32: 7 });
  });

  it('lists certificate revocation entries for the hub', async () => {
    enumCa.mockResolvedValue({ CAList: [] });
    enumCrl.mockResolvedValue({ CRLList: [{ Key_u32: 9, CrlInfo_utf: 'CN=revoked.example.com, Serial=01' }] });

    render(<HubCertificates hub="DEFAULT" />);

    expect(await screen.findByText('CN=revoked.example.com, Serial=01')).toBeInTheDocument();
    expect(enumCrl.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('adds a certificate revocation entry from a certificate upload', async () => {
    enumCa.mockResolvedValue({ CAList: [] });
    addCrl.mockResolvedValue({});
    const user = userEvent.setup();

    render(<HubCertificates hub="DEFAULT" />);
    await screen.findByText('No revoked certificates');

    await user.click(screen.getByRole('button', { name: 'Add revoked certificate' }));
    await screen.findByText('Load values from certificate');
    const dialog = await screen.findByRole('dialog');
    const fileInput = dialog.querySelector('input[type="file"]');
    expect(fileInput).toBeInstanceOf(HTMLInputElement);
    await user.upload(fileInput as HTMLInputElement, new File([SELF_SIGNED_CERT_PEM()], 'revoked.pem', { type: 'application/x-pem-file' }));

    await waitFor(() => expect(within(dialog).getByLabelText('Common name')).toHaveValue('test.example.com'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(addCrl).toHaveBeenCalledOnce());
    const sent = addCrl.mock.calls[0][0];
    expect(sent).toMatchObject({
      HubName_str: 'DEFAULT',
      CommonName_utf: 'test.example.com',
      Organization_utf: 'TestOrg',
      Unit_utf: 'TestUnit',
      Country_utf: 'US',
    });
    expect(sent.Serial_bin.length).toBeGreaterThan(0);
    expect(sent.DigestSHA1_bin).toHaveLength(20);
  });

  it('edits and deletes a certificate revocation entry', async () => {
    enumCa.mockResolvedValue({ CAList: [] });
    enumCrl.mockResolvedValue({ CRLList: [{ Key_u32: 9, CrlInfo_utf: 'CN=revoked.example.com' }] });
    getCrl.mockResolvedValue({
      Key_u32: 9,
      CommonName_utf: 'revoked.example.com',
      Organization_utf: '',
      Unit_utf: '',
      Country_utf: '',
      State_utf: '',
      Local_utf: '',
      Serial_bin: bytesB64([1]),
      DigestMD5_bin: new Uint8Array(),
      DigestSHA1_bin: bytesB64([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
    });
    setCrl.mockResolvedValue({});
    delCrl.mockResolvedValue({});
    const user = userEvent.setup();

    render(<HubCertificates hub="DEFAULT" />);
    await screen.findByText('CN=revoked.example.com');

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    await waitFor(() => expect(getCrl).toHaveBeenCalledOnce());
    await screen.findByText('Edit revoked certificate');
    const editDialog = await screen.findByRole('dialog');
    const save = within(editDialog).getByRole('button', { name: 'Save' });
    expect(within(editDialog).getByLabelText('Serial number')).toHaveValue('01');
    expect(within(editDialog).getByLabelText('SHA1 digest')).toHaveValue('00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 13');
    expect(save).toBeDisabled();
    const commonName = within(editDialog).getByLabelText('Common name');
    await user.clear(commonName);
    await user.type(commonName, 'blocked.example.com');
    expect(save).toBeEnabled();
    await user.clear(commonName);
    await user.type(commonName, 'revoked.example.com');
    expect(save).toBeDisabled();
    await user.clear(commonName);
    await user.type(commonName, 'blocked.example.com');
    await user.click(save);

    await waitFor(() => expect(setCrl).toHaveBeenCalledOnce());
    expect(setCrl.mock.calls[0][0]).toMatchObject({
      HubName_str: 'DEFAULT',
      Key_u32: 9,
      CommonName_utf: 'blocked.example.com',
    });
    expect(Array.from(setCrl.mock.calls[0][0].Serial_bin)).toEqual([1]);
    expect(Array.from(setCrl.mock.calls[0][0].DigestSHA1_bin)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);

    await user.click(await screen.findByRole('button', { name: /kebab toggle/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await screen.findByText('Delete revoked certificate');
    const deleteDialog = await screen.findByRole('dialog');
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(delCrl).toHaveBeenCalledOnce());
    expect(delCrl.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT', Key_u32: 9 });
  });
});
