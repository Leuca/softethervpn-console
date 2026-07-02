// Import the vpnrpc.ts RPC stub.
import * as VPN from 'vpnrpc/dist/vpnrpc';

// Output JSON-RPC request / reply strings to the debug console.
VPN.VpnServerRpc.SetDebugMode(process.env.NODE_ENV === 'development');

export let api: VPN.VpnServerRpc;

if (process.env.NODE_ENV !== 'development') {
  // On the web browser. We do not need to specify any hostname, port or credential
  // as the web browser already knows it (the console is served by the VPN server itself).
  api = new VPN.VpnServerRpc();
} else {
  // During development the target VPN Server's hostname, port and credentials
  // are taken from the environment (.env / .env.defaults, see dotenv-webpack).
  api = new VPN.VpnServerRpc(
    process.env.VPN_DEV_HOST || '127.0.0.1',
    Number(process.env.VPN_DEV_PORT || 5555),
    process.env.VPN_DEV_HUB || '',
    process.env.VPN_DEV_PASSWORD || '',
    false,
  );
}
