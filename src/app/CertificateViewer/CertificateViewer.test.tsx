import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CertificateModal } from './CertificateViewer';
import { SELF_SIGNED_CERT_B64, SELF_SIGNED_CERT_DER } from '@app/utils/x509.fixture';

describe('CertificateModal', () => {
  it('renders parsed certificate fields', () => {
    render(<CertificateModal certBin={SELF_SIGNED_CERT_DER()} isOpen onClose={() => undefined} />);

    expect(screen.getByText('Certificate: test.example.com')).toBeInTheDocument();
    // both subject and issuer are the self-signed identity, so these appear twice
    expect(screen.getAllByText('test.example.com').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('TestUnit').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Self-signed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download (PEM)' })).toBeEnabled();
  });

  it('accepts a base64 string as returned by the RPC API', () => {
    render(<CertificateModal certBin={SELF_SIGNED_CERT_B64} isOpen onClose={() => undefined} />);

    expect(screen.getByText('Certificate: test.example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download (PEM)' })).toBeEnabled();
  });

  it('shows an error and disables download for unparseable bytes', () => {
    render(<CertificateModal certBin={new Uint8Array([1, 2, 3])} isOpen onClose={() => undefined} />);

    expect(screen.getByText('Could not read certificate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download (PEM)' })).toBeDisabled();
  });

  it('renders nothing sensitive when no certificate is provided', () => {
    render(<CertificateModal certBin={null} isOpen onClose={() => undefined} />);

    expect(screen.getByText('Certificate')).toBeInTheDocument();
    expect(screen.queryByText('Could not read certificate')).not.toBeInTheDocument();
  });
});
