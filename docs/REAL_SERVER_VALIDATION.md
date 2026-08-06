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
- An isolated temporary Virtual Hub was created, read, updated, and deleted.
  The post-check confirmed that no validation Hub remained on the server.
- An established managed session returned the fixed HTTP 502 response while a
  local relay to the server was offline, remained authenticated, and resumed
  RPC traffic through the same session when the relay returned.

Known build behavior: `GetCaps` advertises DDNS proxy support, but
`GetDDnsInternetSettng` returns SoftEther error 33. The Dynamic DNS page handles
this as an informational unsupported-feature state. A nonzero session limit
was ignored during Virtual Hub creation but accepted by `SetHub`; the console
already creates a Hub with the server's unlimited default and applies later
changes through `SetHub`.

## 2026-08-05: Stable 4.44 Build 9807

| Area             | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| Console revision | `4832847`                                                |
| SoftEther        | Stable 4.44 Build 9807, official ARM64 package           |
| Server           | Standalone in an isolated Fedora Linux 44 container      |
| Roles            | Whole-server administrator and Virtual Hub administrator |
| Console paths    | Integrated development proxy and local managed gateway   |
| Browser          | Chromium 150                                             |

The following checks passed:

- The official ARM64 package passed its environment check and reported the
  expected product, version, build, and standalone mode through JSON-RPC.
- Server-administrator bootstrap and core read-only RPCs succeeded. The server
  advertised Local Bridge as unavailable and returned error 84 for its RPC;
  the console omitted the corresponding route and dashboard card.
- Hub administration returned error 52 for the server-only role probe, and the
  console identified the role as Hub Administrator. It showed only the assigned
  Hub, omitted server-administrator creation and deletion actions, and denied a
  direct Dynamic DNS route with the expected permission message.
- The Hub administrator's online toggle succeeded both offline and online.
  Hub-scoped status, session, table, user, group, access, certificate, cascade,
  logging, message, RADIUS, and option RPCs also succeeded.
- Managed login and RPC proxying succeeded for both roles. After the VPN Server
  process restarted, the existing managed session resumed RPC traffic and the
  configured Hubs remained present.

## 2026-08-05: VPN Bridge 4.44 Build 9807

| Area             | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| Console baseline | `a7d7a02`, plus the Bridge tab correction in this change     |
| SoftEther        | Stable 4.44 Build 9807, official ARM64 VPN Bridge package    |
| Server           | VPN Bridge in an isolated Fedora Linux 44 container          |
| Role             | Whole-server administrator                                   |
| Console paths    | Integrated development proxy and local managed gateway       |
| Browser          | Chromium 150                                                 |

The following checks passed:

- The Bridge reported its product, version, build, mode, capability list, and
  default `BRIDGE` Hub correctly. Core server, status, session, table, cascade,
  Secure NAT, and log RPCs succeeded.
- The dashboard identified Bridge mode and omitted unsupported functionality.
  A direct Layer 3 Switch URL was denied by the route guard.
- Real RPC results showed that Properties, Users, Groups, Access List, Trusted
  CA, and RADIUS are unavailable on VPN Bridge. The Hub detail now omits those
  tabs and falls back to Status when an old direct tab URL selects one. Status,
  Sessions, Tables, Cascade, Secure NAT, and Logs remain available.
- Managed login with the explicit self-signed option, a proxied read-only RPC,
  and logout succeeded.

## Remaining release matrix

- Developer 5.02 Build 5188.
- Cluster controller and cluster member.
- A certificate trusted by the gateway host and large collections.
- Capability and route visibility comparisons for every remaining mode above.
