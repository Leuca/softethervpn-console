# Real-server validation

This file records cumulative release evidence. A result applies only to the
listed SoftEther build, operating mode, role, and console path; it does not
stand in for an untested row of the support matrix. Never record credentials,
cookies, private keys, or private endpoint details here.

## 2026-08-05: Developer 5.02 Build 5187

| Area             | Value                                                  |
| ---------------- | ------------------------------------------------------ |
| Console revision | `cc9e6a3`                                              |
| SoftEther        | Developer 5.02 Build 5187, 64-bit open-source edition  |
| Server           | Standalone on Fedora Linux 44                          |
| Role             | Whole-server administrator                             |
| Console paths    | Integrated development proxy and local managed gateway |
| Browser          | Chromium 150                                           |

Build 5187 is a best-effort target under the support policy, not the supported
Developer 5.02 Build 5188 baseline.

The following checks passed:

- Bootstrap RPCs reported the administrator role, standalone mode, server
  identity, capabilities, Dynamic DNS, VPN Azure, and Virtual Hub inventory.
- Read-only RPCs used by the server, networking, certificate, configuration,
  log, Hub status, session, table, user, group, access-list, Secure NAT,
  certificate, cascade, logging, message, RADIUS, and option pages succeeded.
- The dashboard, server information, Virtual Hub list and detail, and Dynamic
  DNS pages rendered live data without console-visible errors.
- Strict TLS rejected the server's self-signed certificate. The managed
  gateway's explicit self-signed option logged in, created a session, proxied a
  test RPC, logged out, and then reported an unauthenticated session.
- Invalid administrator credentials returned HTTP 401 directly and the
  managed gateway returned its fixed login error without leaking server detail.

Known build behavior: `GetCaps` advertises DDNS proxy support, but
`GetDDnsInternetSettng` returns SoftEther error 33. The Dynamic DNS page handles
this as an informational unsupported-feature state.

## Remaining release matrix

- Stable 4.44 Build 9807 and Developer 5.02 Build 5188.
- VPN Bridge, cluster controller, cluster member, and Virtual Hub administrator.
- A certificate trusted by the gateway host, large collections, reversible
  configuration changes, server restart, and temporary outage recovery.
- Capability and route visibility comparisons for every mode and role above.
