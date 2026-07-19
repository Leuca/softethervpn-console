# Fedora source package

This directory packages the managed SoftEther VPN Console deployment. The RPM
contains the managed frontend, the Node.js gateway, its runtime dependencies,
an HTTP-only systemd service, and operator configuration. The integrated
frontend remains part of SoftEther VPN Server and is not installed by this RPM.

## Release flow

The `srpm` release job runs only after the GitHub Release job succeeds. It:

1. Downloads the tagged GitHub source archive used by `Source0`.
2. Uses Fedora's `nodejs-packaging-bundler` to create separate production and
   development dependency archives for the frontend and gateway.
3. Generates the required `bundled(npm(...))` RPM provides from both lockfiles
   and includes the bundler-generated dependency license reports for review.
4. Injects the release version, RPM-compatible version, repository owner,
   bundled provides, and changelog entry into the spec.
5. Builds and checks the SRPM, creates its SHA-256 checksum, and uploads both as
   assets of the existing GitHub release.

The resulting SRPM is self-contained. Binary RPM builds use the bundled sources
and do not contact the npm registry.

## Bundled license review

The bundler's recursive package scan reports two nested fixture manifests as
missing license declarations. `pino/test/fixtures/transport/package.json` is
covered by Pino's bundled MIT license, and
`secure-json-parse/benchmarks/package.json` is covered by the parent package's
bundled BSD-3-Clause license. Neither fixture is an independent lockfile
dependency.

These warnings must remain visible and be reviewed again whenever Pino or
secure-json-parse is updated. Do not add declarations to bundled third-party
files or suppress the bundler's license diagnostics globally.

## Local SRPM build

On Fedora, install the same tools used by CI:

```sh
sudo dnf install gh nodejs-packaging-bundler rpm-build rpmlint systemd-rpm-macros
```

Then build a released version:

```sh
SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" \
  packaging/build-srpm.sh 0.2.0 "$PWD/artifacts"
```

Use `mock` to build the generated SRPM in a clean Fedora environment:

```sh
mock -r fedora-rawhide-x86_64 --rebuild artifacts/*.src.rpm
```

## Runtime

The service binds to `127.0.0.1:8080` by default. Review
`/etc/sysconfig/softethervpn-console`, configure a trusted HTTPS reverse proxy,
and then enable the service:

```sh
sudo systemctl enable --now softethervpn-console.service
```

The service uses a systemd dynamic user and has no persistent writable state.
Managed sessions and administrator credentials remain in memory and are lost
when the service restarts. The unit is intentionally not enabled automatically
when the package is installed.
