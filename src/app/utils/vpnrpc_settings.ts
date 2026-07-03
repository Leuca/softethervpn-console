// Import the vpnrpc.ts RPC stub.
import * as VPN from 'vpnrpc/dist/vpnrpc';

// Output JSON-RPC request / reply strings to the debug console.
VPN.VpnServerRpc.SetDebugMode(process.env.NODE_ENV === 'development');

export let api: VPN.VpnServerRpc;

// The console always talks to the VPN server at the same origin under /api/.
//
// In production the VPN server serves the console itself, so the browser is
// already authenticated and no hostname or credentials are needed. In
// development the webpack dev server proxies /api/ to the target VPN server
// (see webpack.dev.js), terminating its self-signed TLS certificate and
// injecting the admin credentials on the way through. Either way the client is
// constructed with no hostname: vpnrpc then POSTs to /api/ and sends no
// X-VPNADMIN-* headers of its own.
//
// This same-origin setup is what keeps development working against a real
// server. Talking to the server cross-origin from the browser instead fails
// two ways: its self-signed certificate is rejected before any request is
// sent, and vpnrpc's empty X-VPNADMIN-HUBNAME header (sent when administering
// the whole server) makes SoftEther's HTTP parser drop the connection with no
// response. The proxy avoids both.
api = new VPN.VpnServerRpc();
