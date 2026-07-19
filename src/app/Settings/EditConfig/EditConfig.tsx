import * as React from 'react';
import {
  Alert,
  Bullseye,
  Button,
  Content,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Spinner,
  TextArea,
} from '@patternfly/react-core';
import { DownloadIcon } from '@patternfly/react-icons';
import * as VPN from 'vpnrpc/dist/vpnrpc';
import { api } from '@app/utils/vpnrpc_settings';
import { AppPage } from '@app/components/AppPage';
import { binToBytes, downloadBlob } from '@app/utils/blob_utils';

// After applying, the server restarts; wait a moment, then poll until it is
// back rather than showing the transient connection error.
const RESTART_WAIT_MS = 5000;
const RETRY_INTERVAL_MS = 3000;
const MAX_RETRIES = 12;

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
  // The loaded config seeds an uncontrolled textarea: configs can be large
  // and a controlled value would re-render the page on every keystroke.
  // Edits are read from the ref when downloading or applying.
  const [loadedText, setLoadedText] = React.useState<string | null>(null);
  const configRef = React.useRef<HTMLTextAreaElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const timerRef = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  const fetchConfig = React.useCallback(
    () =>
      api.GetConfig().then((response) => {
        // SoftEther prefixes the internal config name with '$' (or '@'); strip
        // it so the downloaded file is named vpn_server.config, not $vpn_...
        const name = (response.FileName_str || '').replace(/^[$@]/, '');
        setFileName(name || 'vpn_server.config');
        const bytes = binToBytes(response.FileData_bin);
        // TextDecoder strips a leading BOM; guard in case one survives.
        const decoded = bytes ? new TextDecoder().decode(bytes) : '';
        setLoadedText(decoded.replace(/^\uFEFF/, ''));
      }),
    [],
  );

  const load = React.useCallback(() => {
    setError(null);
    fetchConfig().catch((e) => setError(String(e)));
  }, [fetchConfig]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Poll for the server coming back after a restart, then reload the app so
  // server capabilities, routes, and navigation are rebuilt.
  const waitForRestart = React.useCallback(() => {
    let attempts = 0;
    const attempt = () => {
      fetchConfig()
        .then(() => window.location.reload())
        .catch(() => {
          attempts += 1;
          if (attempts >= MAX_RETRIES) {
            setRestarting(false);
            setError('The VPN server did not come back online in time. Reload the page to reconnect.');
          } else {
            timerRef.current = window.setTimeout(attempt, RETRY_INTERVAL_MS);
          }
        });
    };
    timerRef.current = window.setTimeout(attempt, RESTART_WAIT_MS);
  }, [fetchConfig]);

  // The edited text if the editor is mounted, else the loaded text.
  const currentText = (): string | null => configRef.current?.value ?? loadedText;

  const download = () => {
    const value = currentText();
    if (value === null) {
      return;
    }
    downloadBlob(new Blob([toConfigBytes(value)], { type: 'text/plain' }), fileName);
  };

  const apply = () => {
    const value = currentText();
    if (value === null) {
      setError('Load the configuration before applying changes.');
      return;
    }
    setApplying(true);
    setError(null);
    api
      .SetConfig(new VPN.VpnRpcConfig({ FileName_str: fileName, FileData_bin: toConfigBytes(value) }))
      .then(() => {
        setConfirmOpen(false);
        // The server restarts on success; wait for it to come back instead of
        // hitting it mid-restart and showing a transient error.
        setApplying(false);
        setLoadedText(null);
        setRestarting(true);
        waitForRestart();
      })
      .catch((e) => {
        setConfirmOpen(false);
        setError(String(e));
        setApplying(false);
      });
  };

  const isLoading = loadedText === null && error === null && !restarting;
  const hasConfig = loadedText !== null;
  const busy = isLoading || applying || restarting;

  const actions = (
    <>
      <Button
        variant="secondary"
        icon={<DownloadIcon />}
        onClick={download}
        isDisabled={busy || !hasConfig}
        style={{ marginInlineEnd: 'var(--pf-t--global--spacer--sm)' }}
      >
        Download
      </Button>
      <Button variant="primary" onClick={() => setConfirmOpen(true)} isDisabled={busy || !hasConfig} isLoading={applying}>
        Apply
      </Button>
    </>
  );

  return (
    <AppPage
      title="Edit Configuration"
      description="View and edit the raw VPN server configuration file."
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

      {restarting ? (
        <Bullseye>
          <div style={{ textAlign: 'center' }}>
            <Spinner size="xl" aria-label="Waiting for the VPN server to restart" />
            <Content component="p" style={{ marginBlockStart: 'var(--pf-t--global--spacer--md)' }}>
              Configuration applied. Waiting for the VPN server to restart and come back online...
            </Content>
          </div>
        </Bullseye>
      ) : isLoading ? (
        <Bullseye>
          <Spinner size="xl" aria-label="Loading configuration" />
        </Bullseye>
      ) : hasConfig ? (
        <TextArea
          ref={configRef}
          defaultValue={loadedText ?? ''}
          aria-label="VPN server configuration"
          resizeOrientation="vertical"
          style={{ minHeight: '28rem', fontFamily: 'var(--pf-t--global--font--family--mono)', whiteSpace: 'pre' }}
        />
      ) : null}

      <Modal
        variant={ModalVariant.small}
        isOpen={confirmOpen}
        onClose={() => !applying && !restarting && setConfirmOpen(false)}
      >
        <ModalHeader title="Apply configuration" titleIconVariant="warning" />
        <ModalBody>
          Applying this configuration overwrites the server settings and <strong>restarts the VPN server</strong>.
          Existing connections are dropped. Continue?
        </ModalBody>
        <ModalFooter>
          <Button
            variant="danger"
            onClick={apply}
            isDisabled={!hasConfig || applying || restarting}
            isLoading={applying}
          >
            Apply and restart
          </Button>
          <Button variant="link" onClick={() => setConfirmOpen(false)} isDisabled={applying || restarting}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  );
};

export { EditConfig };
