import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  FileUpload,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextInput,
} from '@patternfly/react-core';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { CertificateModal } from '@app/CertificateViewer/CertificateViewer';
import { api } from '@app/utils/vpnrpc_settings';
import { formatOptionalDate } from '@app/utils/format';
import { certificateBytesToDer, parseCertificate } from '@app/utils/x509';
import { binToBytes } from '@app/utils/blob_utils';
import { recordChanged } from '@app/utils/dirty';

interface CrlFormState {
  key: number | null;
  commonName: string;
  organization: string;
  unit: string;
  country: string;
  state: string;
  local: string;
  serial: string;
  md5: string;
  sha1: string;
  certificateFilename: string;
  certificateError: string | null;
}

type PendingDelete =
  | { kind: 'ca'; item: VPN.VpnRpcHubEnumCAItem }
  | { kind: 'crl'; item: VPN.VpnRpcEnumCrlItem };

const emptyCrlForm = (): CrlFormState => ({
  key: null,
  commonName: '',
  organization: '',
  unit: '',
  country: '',
  state: '',
  local: '',
  serial: '',
  md5: '',
  sha1: '',
  certificateFilename: '',
  certificateError: null,
});

const hexFromBytes = (value: unknown): string => {
  const bytes = binToBytes(value);
  return bytes
    ? Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ')
    : '';
};

const compactHex = (value: string): string => value.replace(/[\s:.-]/g, '');

const parseHexBytes = (value: string, label: string, expectedLength?: number): { bytes: Uint8Array; error: string | null } => {
  const hex = compactHex(value);
  if (!hex) {
    return { bytes: new Uint8Array(), error: null };
  }
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    return { bytes: new Uint8Array(), error: `${label} must be hexadecimal byte pairs.` };
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    return { bytes: new Uint8Array(), error: `${label} must be ${expectedLength} bytes.` };
  }
  return { bytes, error: null };
};

const rotl32 = (value: number, bits: number): number => ((value << bits) | (value >>> (32 - bits))) >>> 0;

const sha1 = (data: Uint8Array): Uint8Array => {
  const bitLength = data.length * 8;
  const paddingLength = (64 - ((data.length + 1 + 8) % 64)) % 64;
  const message = new Uint8Array(data.length + 1 + paddingLength + 8);
  message.set(data);
  message[data.length] = 0x80;
  const highLength = Math.floor(bitLength / 0x100000000);
  const lowLength = bitLength >>> 0;
  message[message.length - 8] = (highLength >>> 24) & 0xff;
  message[message.length - 7] = (highLength >>> 16) & 0xff;
  message[message.length - 6] = (highLength >>> 8) & 0xff;
  message[message.length - 5] = highLength & 0xff;
  message[message.length - 4] = (lowLength >>> 24) & 0xff;
  message[message.length - 3] = (lowLength >>> 16) & 0xff;
  message[message.length - 2] = (lowLength >>> 8) & 0xff;
  message[message.length - 1] = lowLength & 0xff;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let chunk = 0; chunk < message.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const offset = chunk + i * 4;
      words[i] =
        ((message[offset] << 24) | (message[offset + 1] << 16) | (message[offset + 2] << 8) | message[offset + 3]) >>>
        0;
    }
    for (let i = 16; i < 80; i++) {
      words[i] = rotl32(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl32(a, 5) + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((word, index) => {
    digest[index * 4] = (word >>> 24) & 0xff;
    digest[index * 4 + 1] = (word >>> 16) & 0xff;
    digest[index * 4 + 2] = (word >>> 8) & 0xff;
    digest[index * 4 + 3] = word & 0xff;
  });
  return digest;
};

const readCertBytes = (file: File, onBytes: (b: Uint8Array) => void, onError: (m: string) => void): void => {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      onBytes(certificateBytesToDer(new Uint8Array(reader.result as ArrayBuffer)));
    } catch {
      onError('The file is not a valid certificate (PEM or DER).');
    }
  };
  reader.onerror = () => onError('The certificate file could not be read.');
  reader.readAsArrayBuffer(file);
};

const crlFormFromResponse = (response: VPN.VpnRpcCrl): CrlFormState => ({
  key: response.Key_u32,
  commonName: response.CommonName_utf ?? '',
  organization: response.Organization_utf ?? '',
  unit: response.Unit_utf ?? '',
  country: response.Country_utf ?? '',
  state: response.State_utf ?? '',
  local: response.Local_utf ?? '',
  serial: hexFromBytes(response.Serial_bin),
  md5: hexFromBytes(response.DigestMD5_bin),
  sha1: hexFromBytes(response.DigestSHA1_bin),
  certificateFilename: '',
  certificateError: null,
});

const crlComparable = (form: CrlFormState | null): Record<string, unknown> | null =>
  form
    ? {
        commonName: form.commonName,
        organization: form.organization,
        unit: form.unit,
        country: form.country,
        state: form.state,
        local: form.local,
        serial: form.serial,
        md5: form.md5,
        sha1: form.sha1,
      }
    : null;

const HubCertificates: React.FunctionComponent<{ hub: string }> = ({ hub }) => {
  const [certs, setCerts] = React.useState<VPN.VpnRpcHubEnumCAItem[] | null>(null);
  const [crls, setCrls] = React.useState<VPN.VpnRpcEnumCrlItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filename, setFilename] = React.useState('');
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [viewCert, setViewCert] = React.useState<Uint8Array | string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<PendingDelete | null>(null);
  const [crlForm, setCrlForm] = React.useState<CrlFormState | null>(null);
  const [crlOriginal, setCrlOriginal] = React.useState<CrlFormState | null>(null);
  const [crlSaving, setCrlSaving] = React.useState(false);
  const importingRef = React.useRef(false);

  const load = React.useCallback(() => {
    setCerts(null);
    setCrls(null);
    setError(null);
    Promise.all([
      api.EnumCa(new VPN.VpnRpcHubEnumCA({ HubName_str: hub })),
      api.EnumCrl(new VPN.VpnRpcEnumCrl({ HubName_str: hub })),
    ])
      .then(([caResponse, crlResponse]) => {
        setCerts(caResponse.CAList ?? []);
        setCrls(crlResponse.CRLList ?? []);
      })
      .catch((e) => {
        setError(String(e));
        setCerts([]);
        setCrls([]);
      });
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  const addCert = (_event: unknown, file: File) => {
    if (importingRef.current) {
      return;
    }
    importingRef.current = true;
    setFileError(null);
    setFilename(file.name);
    readCertBytes(
      file,
      (bytes) => {
        api
          .AddCa(new VPN.VpnRpcHubAddCA({ HubName_str: hub, Cert_bin: bytes }))
          .then(() => {
            setFilename('');
            load();
          })
          .catch((e) => setFileError(String(e)))
          .finally(() => {
            importingRef.current = false;
          });
      },
      (message) => {
        setFileError(message);
        importingRef.current = false;
      },
    );
  };

  const view = (key: number) => {
    api
      .GetCa(new VPN.VpnRpcHubGetCA({ HubName_str: hub, Key_u32: key }))
      .then((response) => setViewCert(response.Cert_bin))
      .catch((e) => setError(String(e)));
  };

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const pending = pendingDelete;
    setPendingDelete(null);
    const request =
      pending.kind === 'ca'
        ? api.DeleteCa(new VPN.VpnRpcHubDeleteCA({ HubName_str: hub, Key_u32: pending.item.Key_u32 }))
        : api.DelCrl(new VPN.VpnRpcCrl({ HubName_str: hub, Key_u32: pending.item.Key_u32 }));
    request.then(() => load()).catch((e) => setError(String(e)));
  };

  const editCrl = (key: number) => {
    api
      .GetCrl(new VPN.VpnRpcCrl({ HubName_str: hub, Key_u32: key }))
      .then((response) => {
        const form = crlFormFromResponse(response);
        setCrlForm(form);
        setCrlOriginal(form);
      })
      .catch((e) => setError(String(e)));
  };

  const setCrlField = (field: keyof CrlFormState, value: string | null) => {
    setCrlForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const loadCrlCertificate = (_event: unknown, file: File) => {
    setCrlField('certificateFilename', file.name);
    readCertBytes(
      file,
      (bytes) => {
        try {
          const cert = parseCertificate(bytes);
          setCrlForm((current) =>
            current
              ? {
                  ...current,
                  commonName: cert.subject.commonName,
                  organization: cert.subject.organization,
                  unit: cert.subject.organizationalUnit,
                  country: cert.subject.country,
                  state: cert.subject.state,
                  local: cert.subject.locality,
                  serial: cert.serialNumber,
                  sha1: hexFromBytes(sha1(bytes)),
                  certificateFilename: file.name,
                  certificateError: null,
                }
              : current,
          );
        } catch {
          setCrlField('certificateError', 'The file is not a valid certificate (PEM or DER).');
        }
      },
      (message) => setCrlField('certificateError', message),
    );
  };

  const serialResult = parseHexBytes(crlForm?.serial ?? '', 'Serial');
  const md5Result = parseHexBytes(crlForm?.md5 ?? '', 'MD5 digest', 16);
  const sha1Result = parseHexBytes(crlForm?.sha1 ?? '', 'SHA1 digest', 20);
  const crlValidationError = serialResult.error ?? md5Result.error ?? sha1Result.error;
  const crlDirty = crlForm?.key === null || recordChanged(crlComparable(crlOriginal), crlComparable(crlForm));
  const crlHasMatcher =
    crlForm !== null &&
    [
      crlForm.commonName,
      crlForm.organization,
      crlForm.unit,
      crlForm.country,
      crlForm.state,
      crlForm.local,
      compactHex(crlForm.serial),
      compactHex(crlForm.md5),
      compactHex(crlForm.sha1),
    ].some((value) => value.trim() !== '');

  const saveCrl = () => {
    if (!crlForm || crlValidationError || !crlHasMatcher) {
      return;
    }
    setCrlSaving(true);
    const payload = new VPN.VpnRpcCrl({
      HubName_str: hub,
      Key_u32: crlForm.key ?? 0,
      CommonName_utf: crlForm.commonName.trim(),
      Organization_utf: crlForm.organization.trim(),
      Unit_utf: crlForm.unit.trim(),
      Country_utf: crlForm.country.trim(),
      State_utf: crlForm.state.trim(),
      Local_utf: crlForm.local.trim(),
      Serial_bin: serialResult.bytes,
      DigestMD5_bin: md5Result.bytes,
      DigestSHA1_bin: sha1Result.bytes,
    });
    const request = crlForm.key === null ? api.AddCrl(payload) : api.SetCrl(payload);
    request
      .then(() => {
        setCrlForm(null);
        setCrlOriginal(null);
        load();
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCrlSaving(false));
  };

  const isLoading = (certs === null || crls === null) && error === null;

  return (
    <Flex
      direction={{ default: 'column' }}
      gap={{ default: 'gapMd' }}
      style={{ paddingBlockStart: 'var(--pf-t--global--spacer--md)' }}
    >
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} gap={{ default: 'gapMd' }}>
        <FlexItem grow={{ default: 'grow' }}>
          <Form>
            <FormGroup label="Add trusted CA certificate" fieldId="trusted-ca-upload">
              <FileUpload
                id="trusted-ca-upload"
                type="dataURL"
                filename={filename}
                filenamePlaceholder="Upload a CA certificate"
                browseButtonText="Upload"
                hideDefaultPreview
                onFileInputChange={addCert}
                onClearClick={() => {
                  setFilename('');
                  setFileError(null);
                }}
                dropzoneProps={{ accept: { 'application/x-x509-ca-cert': ['.cer', '.crt', '.cert', '.pem'] } }}
                filenameAriaLabel="CA certificate file name"
              />
              {fileError && (
                <HelperText>
                  <HelperTextItem variant="error">{fileError}</HelperTextItem>
                </HelperText>
              )}
            </FormGroup>
          </Form>
        </FlexItem>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={load} isDisabled={isLoading}>
            Refresh
          </Button>
        </FlexItem>
      </Flex>

      {error && (
        <Alert variant="danger" title="Trusted CA operation failed" isInline>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading trusted CA certificates" />
        </Bullseye>
      ) : certs !== null && certs.length === 0 ? (
        <EmptyState titleText="No trusted CA certificates" headingLevel="h2">
          <EmptyStateBody>No hub-specific CA certificates are configured for this Virtual Hub.</EmptyStateBody>
        </EmptyState>
      ) : certs !== null ? (
        <Table aria-label="Trusted CA certificates" variant="compact">
          <Thead>
            <Tr>
              <Th>Subject</Th>
              <Th>Issuer</Th>
              <Th>Expires</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {certs.map((cert) => (
              <Tr key={cert.Key_u32}>
                <Td dataLabel="Subject">{cert.SubjectName_utf || '-'}</Td>
                <Td dataLabel="Issuer">{cert.IssuerName_utf || '-'}</Td>
                <Td dataLabel="Expires">{formatOptionalDate(cert.Expires_dt, '-')}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      { title: 'View certificate', onClick: () => view(cert.Key_u32) },
                      { title: 'Delete', onClick: () => setPendingDelete({ kind: 'ca', item: cert }) },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}

      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
        <FlexItem>
          <strong>Certificate revocation list</strong>
        </FlexItem>
        <FlexItem>
          <Button
            variant="primary"
            onClick={() => {
              setCrlOriginal(null);
              setCrlForm(emptyCrlForm());
            }}
          >
            Add revoked certificate
          </Button>
        </FlexItem>
      </Flex>

      {isLoading ? null : crls !== null && crls.length === 0 ? (
        <EmptyState titleText="No revoked certificates" headingLevel="h2">
          <EmptyStateBody>No revoked certificate definitions are configured for this Virtual Hub.</EmptyStateBody>
        </EmptyState>
      ) : crls !== null ? (
        <Table aria-label="Certificate revocation list" variant="compact">
          <Thead>
            <Tr>
              <Th>Entry</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {crls.map((crl) => (
              <Tr key={crl.Key_u32}>
                <Td dataLabel="Entry">{crl.CrlInfo_utf || crl.Key_u32}</Td>
                <Td isActionCell>
                  <ActionsColumn
                    items={[
                      { title: 'Edit', onClick: () => editCrl(crl.Key_u32) },
                      { title: 'Delete', onClick: () => setPendingDelete({ kind: 'crl', item: crl }) },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : null}

      <Modal variant={ModalVariant.small} isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <ModalHeader
          title={pendingDelete?.kind === 'crl' ? 'Delete revoked certificate' : 'Delete trusted CA certificate'}
          titleIconVariant="warning"
        />
        <ModalBody>
          {pendingDelete?.kind === 'crl' ? (
            <>
              Delete revoked certificate <strong>{pendingDelete.item.CrlInfo_utf || pendingDelete.item.Key_u32}</strong>?
            </>
          ) : (
            <>
              Delete trusted CA certificate{' '}
              <strong>{pendingDelete?.item.SubjectName_utf || pendingDelete?.item.Key_u32}</strong>?
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        variant={ModalVariant.medium}
        isOpen={crlForm !== null}
        onClose={() => {
          setCrlForm(null);
          setCrlOriginal(null);
        }}
      >
        <ModalHeader title={crlForm?.key === null ? 'Add revoked certificate' : 'Edit revoked certificate'} />
        <ModalBody>
          {crlForm && (
            <Form>
              <FormGroup label="Load values from certificate" fieldId="crl-cert-upload">
                <FileUpload
                  id="crl-cert-upload"
                  type="dataURL"
                  filename={crlForm.certificateFilename}
                  filenamePlaceholder="Upload a certificate"
                  browseButtonText="Upload"
                  hideDefaultPreview
                  onFileInputChange={loadCrlCertificate}
                  onClearClick={() => {
                    setCrlField('certificateFilename', '');
                    setCrlField('certificateError', null);
                  }}
                  dropzoneProps={{ accept: { 'application/x-x509-user-cert': ['.cer', '.crt', '.cert', '.pem'] } }}
                  filenameAriaLabel="Revoked certificate file name"
                />
                {crlForm.certificateError && (
                  <HelperText>
                    <HelperTextItem variant="error">{crlForm.certificateError}</HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
              <Flex gap={{ default: 'gapMd' }} flexWrap={{ default: 'wrap' }}>
                <FlexItem grow={{ default: 'grow' }}>
                  <FormGroup label="Common name" fieldId="crl-cn">
                    <TextInput
                      id="crl-cn"
                      value={crlForm.commonName}
                      onChange={(_event, value) => setCrlField('commonName', value)}
                    />
                  </FormGroup>
                </FlexItem>
                <FlexItem grow={{ default: 'grow' }}>
                  <FormGroup label="Organization" fieldId="crl-o">
                    <TextInput
                      id="crl-o"
                      value={crlForm.organization}
                      onChange={(_event, value) => setCrlField('organization', value)}
                    />
                  </FormGroup>
                </FlexItem>
              </Flex>
              <Flex gap={{ default: 'gapMd' }} flexWrap={{ default: 'wrap' }}>
                <FlexItem grow={{ default: 'grow' }}>
                  <FormGroup label="Organizational unit" fieldId="crl-ou">
                    <TextInput id="crl-ou" value={crlForm.unit} onChange={(_event, value) => setCrlField('unit', value)} />
                  </FormGroup>
                </FlexItem>
                <FlexItem grow={{ default: 'grow' }}>
                  <FormGroup label="Country" fieldId="crl-c">
                    <TextInput
                      id="crl-c"
                      value={crlForm.country}
                      onChange={(_event, value) => setCrlField('country', value)}
                    />
                  </FormGroup>
                </FlexItem>
              </Flex>
              <Flex gap={{ default: 'gapMd' }} flexWrap={{ default: 'wrap' }}>
                <FlexItem grow={{ default: 'grow' }}>
                  <FormGroup label="State" fieldId="crl-st">
                    <TextInput id="crl-st" value={crlForm.state} onChange={(_event, value) => setCrlField('state', value)} />
                  </FormGroup>
                </FlexItem>
                <FlexItem grow={{ default: 'grow' }}>
                  <FormGroup label="Locality" fieldId="crl-l">
                    <TextInput id="crl-l" value={crlForm.local} onChange={(_event, value) => setCrlField('local', value)} />
                  </FormGroup>
                </FlexItem>
              </Flex>
              <FormGroup label="Serial number" fieldId="crl-serial">
                <TextInput
                  id="crl-serial"
                  value={crlForm.serial}
                  onChange={(_event, value) => setCrlField('serial', value)}
                  validated={serialResult.error ? 'error' : 'default'}
                />
                {serialResult.error && (
                  <HelperText>
                    <HelperTextItem variant="error">{serialResult.error}</HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
              <FormGroup label="MD5 digest" fieldId="crl-md5">
                <TextInput
                  id="crl-md5"
                  value={crlForm.md5}
                  onChange={(_event, value) => setCrlField('md5', value)}
                  validated={md5Result.error ? 'error' : 'default'}
                />
                {md5Result.error && (
                  <HelperText>
                    <HelperTextItem variant="error">{md5Result.error}</HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
              <FormGroup label="SHA1 digest" fieldId="crl-sha1">
                <TextInput
                  id="crl-sha1"
                  value={crlForm.sha1}
                  onChange={(_event, value) => setCrlField('sha1', value)}
                  validated={sha1Result.error ? 'error' : 'default'}
                />
                {sha1Result.error && (
                  <HelperText>
                    <HelperTextItem variant="error">{sha1Result.error}</HelperTextItem>
                  </HelperText>
                )}
              </FormGroup>
              {!crlHasMatcher && (
                <HelperText>
                  <HelperTextItem variant="warning">
                    Enter at least one subject, serial, or digest field for the revocation rule.
                  </HelperTextItem>
                </HelperText>
              )}
            </Form>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={saveCrl}
            isLoading={crlSaving}
            isDisabled={!crlDirty || !crlHasMatcher || !!crlValidationError}
          >
            Save
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setCrlForm(null);
              setCrlOriginal(null);
            }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <CertificateModal certBin={viewCert} isOpen={viewCert !== null} onClose={() => setViewCert(null)} />
    </Flex>
  );
};

export { HubCertificates };
