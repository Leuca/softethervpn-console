import { describe, expect, it } from 'vitest';
import { certificateBytesToDer, parseCertificate } from './x509';
import { SELF_SIGNED_CERT_DER, SELF_SIGNED_CERT_PEM } from './x509.fixture';

describe('parseCertificate', () => {
  it('extracts subject, issuer, validity and self-issued flag', () => {
    const cert = parseCertificate(SELF_SIGNED_CERT_DER());

    expect(cert.subject).toEqual({
      commonName: 'test.example.com',
      organization: 'TestOrg',
      organizationalUnit: 'TestUnit',
      country: 'US',
      state: '',
      locality: '',
    });
    // Self-signed: issuer equals subject
    expect(cert.issuer.commonName).toBe('test.example.com');
    expect(cert.isSelfIssued).toBe(true);

    expect(cert.notBefore.getUTCFullYear()).toBe(2026);
    expect(cert.notAfter.getUTCFullYear()).toBe(2036);
    expect(cert.signatureAlgorithm).toBe('SHA-256');
  });

  it('formats serial number, public key and signature as spaced upper-case hex', () => {
    const cert = parseCertificate(SELF_SIGNED_CERT_DER());

    // spaced pairs, upper case
    expect(cert.serialNumber).toMatch(/^([0-9A-F]{2} )*[0-9A-F]{2}$/);
    expect(cert.publicKeyHex).toMatch(/^[0-9A-F ]+$/);
    expect(cert.signatureHex).toMatch(/^[0-9A-F ]+$/);
  });

  it('produces a PEM encoding', () => {
    const cert = parseCertificate(SELF_SIGNED_CERT_DER());
    expect(cert.pem).toContain('-----BEGIN CERTIFICATE-----');
    expect(cert.pem).toContain('-----END CERTIFICATE-----');
  });

  it('normalizes PEM certificate bytes to DER', () => {
    const pemBytes = new TextEncoder().encode(SELF_SIGNED_CERT_PEM());
    expect(Array.from(certificateBytesToDer(pemBytes))).toEqual(Array.from(SELF_SIGNED_CERT_DER()));
  });

  it('parses PEM with leading text before the certificate block', () => {
    // openssl -text output and hand-edited files carry text above the block.
    const decorated = `Subject: CN=test.example.com\n\n${SELF_SIGNED_CERT_PEM()}\ntrailing note\n`;
    const cert = parseCertificate(new TextEncoder().encode(decorated));
    expect(cert.subject.commonName).toBe('test.example.com');
    expect(Array.from(certificateBytesToDer(new TextEncoder().encode(decorated)))).toEqual(
      Array.from(SELF_SIGNED_CERT_DER()),
    );
  });

  it('throws on invalid certificate bytes', () => {
    expect(() => parseCertificate(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
