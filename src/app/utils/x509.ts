// @peculiar/x509 depends on tsyringe, which needs the reflect-metadata polyfill
// loaded before it. Import it here, the single module that pulls in x509.
import 'reflect-metadata';
import { X509Certificate } from '@peculiar/x509';

// Distinguished-name fields shown in the certificate viewer.
export interface CertificateName {
  commonName: string;
  organization: string;
  organizationalUnit: string;
  country: string;
}

export interface ParsedCertificate {
  subject: CertificateName;
  issuer: CertificateName;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  signatureAlgorithm: string;
  publicKeyHex: string;
  signatureHex: string;
  // A self-issued certificate (subject == issuer): SoftEther's default
  // self-signed server certificate. Used to decide whether regenerating it
  // (to match a new DDNS CN) is safe.
  isSelfIssued: boolean;
  /** PEM encoding for download. */
  pem: string;
}

// Group hex digits in pairs, upper case, for readable fingerprints.
const spacedHex = (hex: string): string => (hex.match(/.{1,2}/g) ?? []).join(' ').toUpperCase();

const bufferToHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const name = (cert: X509Certificate, which: 'subjectName' | 'issuerName'): CertificateName => {
  const dn = cert[which];
  const first = (id: string): string => dn.getField(id)[0] ?? '';
  return {
    commonName: first('CN'),
    organization: first('O'),
    organizationalUnit: first('OU'),
    country: first('C'),
  };
};

// The API returns some certs as raw DER (cluster server cert) and some as the
// UTF-8 bytes of a PEM block (user certs). Detect PEM so one entry point covers
// both: X509Certificate parses a PEM string but treats a Uint8Array as DER.
const PEM_HEADER = '-----BEGIN CERTIFICATE-----';

const asCertificate = (bytes: Uint8Array): X509Certificate => {
  const text = new TextDecoder().decode(bytes.subarray(0, PEM_HEADER.length));
  if (text === PEM_HEADER) {
    return new X509Certificate(new TextDecoder().decode(bytes));
  }
  return new X509Certificate(bytes);
};

/**
 * Parse an X.509 certificate (the raw `*_bin` field returned by the JSON-RPC
 * API, DER or PEM-text bytes) into the fields the console displays. Throws if
 * the bytes are not a valid certificate; callers render a fallback.
 *
 * Reading fields is pure ASN.1 decoding and needs no WebCrypto engine, so this
 * stays synchronous and safe to call during render.
 */
export function parseCertificate(bytes: Uint8Array): ParsedCertificate {
  const cert = asCertificate(bytes);
  return {
    subject: name(cert, 'subjectName'),
    issuer: name(cert, 'issuerName'),
    serialNumber: spacedHex(cert.serialNumber),
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    signatureAlgorithm: cert.signatureAlgorithm.hash.name,
    publicKeyHex: spacedHex(cert.publicKey.toString('hex')),
    signatureHex: spacedHex(bufferToHex(cert.signature)),
    isSelfIssued: cert.subject === cert.issuer,
    pem: cert.toString('pem'),
  };
}
