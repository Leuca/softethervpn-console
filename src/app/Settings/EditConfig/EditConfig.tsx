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
  const [text, setText] = React.useState<string | null>(null);
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
        setText(decoded.replace(/^\uFEFF/, ''));
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

  // Poll for the server coming back after a restart, then show the reloaded config.
  const waitForRestart = React.useCallback(() => {
    let attempts = 0;
    const attempt = () => {
      fetchConfig()
        .then(() => setRestarting(false))
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

  const download = () => {
    if (text === null) {
      return;
    }
    downloadBlob(new Blob([toConfigBytes(text)], { type: 'text/plain' }), fileName);
  };

  const apply = () => {
    setConfirmOpen(false);
    if (text === null) {
      setError('Load the configuration before applying changes.');
      return;
    }
    setApplying(true);
    setError(null);
    api
      .SetConfig(new VPN.VpnRpcConfig({ FileName_str: fileName, FileData_bin: toConfigBytes(text) }))
      .then(() => {
        // The server restarts on success; wait for it to come back instead of
        // hitting it mid-restart and showing a transient error.
        setApplying(false);
        setText(null);
        setRestarting(true);
        waitForRestart();
      })
      .catch((e) => {
        setError(String(e));
        setApplying(false);
      });
  };

  const isLoading = text === null && error === null && !restarting;
  const hasConfig = text !== null;
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
          value={text}
          onChange={(_event, value) => setText(value)}
          aria-label="VPN server configuration"
          resizeOrientation="vertical"
          style={{ minHeight: '28rem', fontFamily: 'var(--pf-t--global--font--family--mono)', whiteSpace: 'pre' }}
        />
      ) : null}

      <Modal variant={ModalVariant.small} isOpen={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <ModalHeader title="Apply configuration" titleIconVariant="warning" />
        <ModalBody>
          Applying this configuration overwrites the server settings and <strong>restarts the VPN server</strong>.
          Existing connections are dropped. Continue?
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={apply} isDisabled={!hasConfig || applying || restarting}>
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
