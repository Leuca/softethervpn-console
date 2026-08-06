# SoftEther VPN Console 1.0.0

Version 1.0.0 establishes the first stable support, deployment, and versioning
baseline for SoftEther VPN Console. There is no server-side console database or
persistent gateway state to migrate.

## Highlights

- Separate release archives support integrated SoftEther hosting and a managed
  Node.js gateway deployment.
- Server and Virtual Hub administration cover users, groups, policies,
  certificates, sessions, tables, logs, cascades, Secure NAT, listeners,
  networking, clustering, bridges, Layer 3 switching, DDNS, and VPN Azure.
- Navigation and direct routes follow the authenticated role, server mode, and
  reported capabilities.
- Managed mode keeps administrator passwords in gateway memory, verifies
  upstream TLS by default, rate-limits logins, rejects cross-origin writes, and
  pins each session to the server addresses resolved at login.
- The PatternFly 6 interface supports system, light, dark, and high-contrast
  appearance preferences and loads feature pages on demand.

## Operator-visible changes from 0.2.x

- Managed deployments support Node.js 22 and 24.
- Reverse proxies must preserve the public host and port in `Host` and
  `X-Forwarded-Host`, and set trusted `X-Forwarded-For` and
  `X-Forwarded-Proto` values. Mismatched browser origins are rejected.
- A DNS name is resolved at login and its addresses remain fixed for that
  session. Log in again after an intentional DNS change.
- Sessions remain process-local, expire after eight hours, and are lost when
  the gateway restarts. Request bodies are limited to 1 MiB and each client is
  limited to ten login attempts per minute.

## Compatibility and known limits

The supported server versions, roles, browsers, and deployment environments are
listed in the [support policy](SUPPORT.md). Managed mode is a single-process
service for trusted administrators and must remain on a controlled network or
behind a VPN, reverse-proxy SSO, mutual TLS, or an administrator IP allow rule;
HTTPS alone is not sufficient access control. Self-signed SoftEther
certificates remain supported through the explicit login option on trusted
network paths.

SoftEther's cascade-authentication and server-certificate RPCs do not accept a
private-key passphrase, so encrypted PEM keys cannot be imported directly for
those operations. Password-protected PKCS #12 import is supported because the
browser opens the archive before sending the key pair. User-certificate
registration sends only the public certificate and discards any private key
extracted from a PKCS #12 archive.

See the [managed gateway guide](../gateway/README.md) for deployment details and
the [versioning policy](VERSIONING.md) for the stable behavior beginning with
this release.
