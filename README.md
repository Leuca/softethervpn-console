# SoftEther VPN Console

A web management application for [SoftEther VPN Server](https://github.com/SoftEtherVPN/SoftEtherVPN),
built with [PatternFly 6](https://www.patternfly.org/) and the SoftEther VPN Server
[JSON-RPC API Suite](https://github.com/SoftEtherVPN/SoftEtherVPN/tree/master/developer_tools/vpnserver-jsonrpc-clients/).

This is the successor to [softethervpn-web-console](https://github.com/Leuca/softethervpn-web-console)
(PatternFly 4 / React 16), ported onto the current
[PatternFly seed](https://github.com/patternfly/patternfly-react-seed) (PatternFly 6 / React 18 /
TypeScript 5 / react-router 7).

## Releases

[GitHub releases](https://github.com/Leuca/softethervpn-console/releases) provide
separate archives for the two deployment modes:

- `softethervpn-console-vX.Y.Z.tar.gz` contains the integrated frontend bundle.
- `softethervpn-console-managed-vX.Y.Z.tar.gz` contains the managed frontend and
  the compiled Node gateway.

Each archive has a matching `.sha256` file. Download both files into the same
directory and verify an archive before extracting it:

```sh
sha256sum -c softethervpn-console-vX.Y.Z.tar.gz.sha256
```

After extracting a managed archive, install the gateway's production
dependencies and start it with:

```sh
npm install --omit=dev --prefix gateway
npm --prefix gateway start
```

The gateway listens on plain HTTP and should be placed behind a trusted HTTPS
reverse proxy. See [`gateway/README.md`](gateway/README.md) for its configuration
and TLS boundaries.

## Quick-start

```bash
git clone https://github.com/Leuca/softethervpn-console
cd softethervpn-console
npm install
npm run start:dev
```

During development the console connects to the VPN server configured in `.env.defaults`.
Create a local `.env` file (gitignored) to point it at your server:

```ini
VPN_DEV_HOST=vpn.example.org
VPN_DEV_PORT=5555
VPN_DEV_HUB=
VPN_DEV_PASSWORD=your-admin-password
```

Leave `VPN_DEV_HUB` empty for server administration. Set it to a Virtual Hub name
when connecting with that hub's administrator credentials.

Production supports two compile-time deployment modes. Build an integrated
frontend for the VPN server's embedded web server with:

```sh
npm run build:integrated
```

Build and start the managed frontend and Node gateway with:

```sh
npm install --prefix gateway
npm run build:managed
npm --prefix gateway run build
npm --prefix gateway start
```

The managed gateway handles server selection and login. See
[`gateway/README.md`](gateway/README.md) for its deployment and TLS boundaries.

## Development scripts

```sh
# Install frontend development/build dependencies
npm install

# Install gateway dependencies when working on managed deployments
npm install --prefix gateway

# Start the development server
npm run start:dev

# Build the integrated frontend (outputs to the "dist" directory)
npm run build:integrated

# Build the managed frontend and gateway
npm run build:managed
npm --prefix gateway run build

# Run the test suite
npm run test

# Run the test suite with coverage
npm run test:coverage

# Run the linter
npm run lint

# Type-check the frontend, gateway, or complete repository
npm run type-check
npm run type-check:gateway
npm run type-check:all

# Run the code formatter
npm run format

# Launch a tool to inspect the bundle size
npm run bundle-profile:analyze
```

## Integrating the console with SoftEther VPN Server

The embedded web server exposes the console below a URL prefix rather than at the
site root. Set `ASSET_PATH` to that prefix when building the integrated bundle.
For example:

```sh
ASSET_PATH=/admin/default/ npm run build:integrated
```

Keep the trailing slash so generated asset and base URLs resolve below the
configured prefix.

## Development note

This project is developed with assistance from AI coding tools. All changes
remain subject to maintainer review and the project's testing and CI
requirements.
