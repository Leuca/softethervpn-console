import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextArea,
} from '@patternfly/react-core';
import { DownloadIcon, SyncAltIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { binToBytes, downloadBlob } from '@app/utils/blob_utils';

// SoftEther config files are UTF-8 with a byte-order mark.
const BOM = [0xef, 0xbb, 0xbf];
const toConfigBytes = (text: string): Uint8Array => {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(BOM.length + body.length);
  out.set(BOM, 0);
  out.set(body, BOM.length);
  return out;
};

const EditConfig: React.FunctionComponent = () => {
  const [fileName, setFileName] = React.useState('vpn_server.config');
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setText(null);
    setError(null);
    api
      .GetConfig()
      .then((response) => {
        setFileName(response.FileName_str || 'vpn_server.config');
        const bytes = binToBytes(response.FileData_bin);
        // TextDecoder strips a leading BOM; guard in case one survives.
        const decoded = bytes ? new TextDecoder().decode(bytes) : '';
        setText(decoded.replace(/^\uFEFF/, ''));
      })
      .catch((e) => setError(String(e)));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const download = () => {
    downloadBlob(new Blob([toConfigBytes(text ?? '')], { type: 'text/plain' }), fileName);
  };

  const apply = () => {
    setConfirmOpen(false);
    setApplying(true);
    setError(null);
    api
      .SetConfig(new VPN.VpnRpcConfig({ FileName_str: fileName, FileData_bin: toConfigBytes(text ?? '') }))
      .then(() => {
        // The server restarts on success; reload after a short delay.
        setApplying(false);
        load();
      })
      .catch((e) => {
        setError(String(e));
        setApplying(false);
      });
  };

  const isLoading = text === null && error === null;

  const actions = (
    <>
      <Button
        variant="secondary"
        icon={<SyncAltIcon />}
        onClick={load}
        isDisabled={isLoading || applying}
        style={{ marginInlineEnd: 'var(--pf-t--global--spacer--sm)' }}
      >
        Refresh
      </Button>
      <Button
        variant="secondary"
        icon={<DownloadIcon />}
        onClick={download}
        isDisabled={isLoading}
        style={{ marginInlineEnd: 'var(--pf-t--global--spacer--sm)' }}
      >
        Download
      </Button>
      <Button variant="primary" onClick={() => setConfirmOpen(true)} isDisabled={isLoading || applying} isLoading={applying}>
        Apply
      </Button>
    </>
  );

  return (
    <AppPage
      title="Edit Configuration"
      description="View and edit the raw VPN server configuration file. Applying it restarts the server."
      actions={actions}
    >
      <Alert
        variant="warning"
        title="Applying a configuration restarts the VPN server"
        isInline
        style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}
      >
        A malformed configuration can break the server or lose settings. Download a copy first, and only edit if you know
        the file format.
      </Alert>

      {error && (
        <Alert variant="danger" title="Configuration operation failed" isInline style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading configuration" />
        </Bullseye>
      ) : (
        <TextArea
          value={text ?? ''}
          onChange={(_event, value) => setText(value)}
          aria-label="VPN server configuration"
          resizeOrientation="vertical"
          style={{ minHeight: '28rem', fontFamily: 'var(--pf-t--global--font--family--mono)', whiteSpace: 'pre' }}
        />
      )}

      <Modal variant={ModalVariant.small} isOpen={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <ModalHeader title="Apply configuration" titleIconVariant="warning" />
        <ModalBody>
          Applying this configuration overwrites the server settings and <strong>restarts the VPN server</strong>.
          Existing connections are dropped. Continue?
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={apply}>
            Apply and restart
          </Button>
          <Button variant="link" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  );
};

export { EditConfig };
