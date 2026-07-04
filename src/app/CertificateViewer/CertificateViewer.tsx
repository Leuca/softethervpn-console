import * as React from 'react';
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { downloadBlob } from '@app/utils/blob_utils';
import { type CertificateName, type ParsedCertificate, parseCertificate } from '@app/utils/x509';

interface CertificateModalProps {
  /** DER-encoded certificate, or null while none is selected. */
  certBin: Uint8Array | null;
  isOpen: boolean;
  onClose: () => void;
}

const NameList: React.FunctionComponent<{ name: CertificateName }> = ({ name }) => (
  <DescriptionList isHorizontal isCompact>
    <DescriptionListGroup>
      <DescriptionListTerm>Common name</DescriptionListTerm>
      <DescriptionListDescription>{name.commonName || '-'}</DescriptionListDescription>
    </DescriptionListGroup>
    <DescriptionListGroup>
      <DescriptionListTerm>Organization</DescriptionListTerm>
      <DescriptionListDescription>{name.organization || '-'}</DescriptionListDescription>
    </DescriptionListGroup>
    <DescriptionListGroup>
      <DescriptionListTerm>Organizational unit</DescriptionListTerm>
      <DescriptionListDescription>{name.organizationalUnit || '-'}</DescriptionListDescription>
    </DescriptionListGroup>
    <DescriptionListGroup>
      <DescriptionListTerm>Country</DescriptionListTerm>
      <DescriptionListDescription>{name.country || '-'}</DescriptionListDescription>
    </DescriptionListGroup>
  </DescriptionList>
);

// Monospaced, wrapping block for long hex values (keys, signatures).
const HexBlock: React.FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: 'var(--pf-t--global--font--family--mono)',
      fontSize: 'var(--pf-t--global--font--size--body--sm)',
      wordBreak: 'break-all',
    }}
  >
    {children}
  </div>
);

/**
 * Read-only viewer for an X.509 certificate returned by the JSON-RPC API.
 * Controlled: the parent owns open state and passes the DER bytes. Shared by
 * the pages that expose a certificate (cluster member server cert, user certs).
 */
const CertificateModal: React.FunctionComponent<CertificateModalProps> = ({ certBin, isOpen, onClose }) => {
  const parsed = React.useMemo<ParsedCertificate | null>(() => {
    if (!certBin) {
      return null;
    }
    try {
      return parseCertificate(certBin);
    } catch {
      return null;
    }
  }, [certBin]);

  const download = () => {
    if (!parsed) {
      return;
    }
    const filename = `${parsed.subject.commonName || 'certificate'}.pem`;
    downloadBlob(new Blob([parsed.pem], { type: 'application/x-pem-file' }), filename);
  };

  const title = parsed ? `Certificate: ${parsed.subject.commonName || 'Unknown'}` : 'Certificate';

  return (
    <Modal variant={ModalVariant.medium} isOpen={isOpen} onClose={onClose}>
      <ModalHeader title={title} />
      <ModalBody>
        {certBin && parsed === null ? (
          <Alert variant="danger" title="Could not read certificate" isInline>
            The certificate could not be parsed.
          </Alert>
        ) : parsed === null ? null : (
          <Stack hasGutter>
            <StackItem>
              <DescriptionList isHorizontal isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>Type</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Label color={parsed.isSelfIssued ? 'orange' : 'blue'} isCompact>
                      {parsed.isSelfIssued ? 'Self-signed' : 'CA-issued'}
                    </Label>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </StackItem>
            <StackItem>
              <strong>Issued to</strong>
              <NameList name={parsed.subject} />
            </StackItem>
            <StackItem>
              <strong>Issued by</strong>
              <NameList name={parsed.issuer} />
            </StackItem>
            <StackItem>
              <DescriptionList isHorizontal isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>Serial number</DescriptionListTerm>
                  <DescriptionListDescription>
                    <HexBlock>{parsed.serialNumber}</HexBlock>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Issued on</DescriptionListTerm>
                  <DescriptionListDescription>{parsed.notBefore.toLocaleString()}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Expires on</DescriptionListTerm>
                  <DescriptionListDescription>{parsed.notAfter.toLocaleString()}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Signature ({parsed.signatureAlgorithm})</DescriptionListTerm>
                  <DescriptionListDescription>
                    <HexBlock>{parsed.signatureHex}</HexBlock>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Public key</DescriptionListTerm>
                  <DescriptionListDescription>
                    <HexBlock>{parsed.publicKeyHex}</HexBlock>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </StackItem>
          </Stack>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={download} isDisabled={parsed === null}>
          Download (PEM)
        </Button>
        <Button variant="link" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export { CertificateModal };
