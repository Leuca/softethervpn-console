# SoftEther VPN Console

A web management application for [SoftEther VPN Server](https://github.com/SoftEtherVPN/SoftEtherVPN),
built with [PatternFly 6](https://www.patternfly.org/) and the SoftEther VPN Server
[JSON-RPC API Suite](https://github.com/SoftEtherVPN/SoftEtherVPN/tree/master/developer_tools/vpnserver-jsonrpc-clients/).

This is the successor of [softethervpn-web-console](https://github.com/Leuca/softethervpn-web-console)
(PatternFly 4 / React 16), rebased onto the current
[PatternFly seed](https://github.com/patternfly/patternfly-react-seed) (PatternFly 6 / React 18 /
TypeScript 5 / react-router 7). The original pages are being ported incrementally.

## Quick-start

```bash
git clone https://github.com/Leuca/softethervpn-console
cd softethervpn-console
npm install && npm run start:dev
```

During development the console connects to the VPN server configured in `.env.defaults`.
Create a local `.env` file (gitignored) to point it at your server:

```ini
VPN_DEV_HOST=vpn.example.org
VPN_DEV_PORT=5555
VPN_DEV_HUB=
VPN_DEV_PASSWORD=your-admin-password
```

In production builds no configuration is needed: the console is meant to be served by the
VPN server's embedded web server, so the browser session already carries host and credentials.

## Development scripts

```sh
# Install development/build dependencies
npm install

# Start the development server
npm run start:dev

# Run a production build (outputs to "dist" dir)
npm run build

# Run the test suite
npm run test

# Run the test suite with coverage
npm run test:coverage

# Run the linter
npm run lint

# Run the code formatter
npm run format

# Launch a tool to inspect the bundle size
npm run bundle-profile:analyze
```
