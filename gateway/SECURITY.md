# Managed gateway security review

The pre-1.0 gateway is intended for trusted administrators on controlled
networks. It must not be exposed to the public Internet without an administrator
access layer such as a VPN, reverse-proxy SSO, mutual TLS, or an IP allow rule.
Browser-facing HTTPS alone does not provide that access control.

| Area                      | Current handling                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User-selected upstream    | A trusted administrator may select any syntactically valid host and schema-validated port. The protected administrator access layer is therefore part of the supported deployment boundary.                  |
| SSRF and private networks | The selected address can reach services visible to the gateway. Only trusted administrators may reach the gateway; firewall, routing, and egress rules are recommended as defense in depth.                  |
| DNS rebinding             | Hostnames are resolved once during login. The complete initial address set is pinned in the session and used for every later connection without another DNS lookup.                                          |
| Login brute force         | Each client address gets ten login attempts per minute. The limit is process-local, resets on restart, and does not replace reverse-proxy rate limiting for exposed deployments.                             |
| Request size              | Fastify rejects bodies over 1 MiB before a route handler runs.                                                                                                                                               |
| JSON-RPC proxy            | Only authenticated `POST /api/` requests are forwarded. The upstream path, method, authentication headers, and HTTPS transport are fixed. Socket pooling is disabled so each request uses its session's pin. |
| Session fixation          | Login creates a new 256-bit random session ID and invalidates the previous cookie's session after a successful probe.                                                                                        |
| CSRF                      | Cookies use `SameSite=Strict`; state-changing requests with a mismatched `Origin` are rejected. Requests without `Origin` remain available to non-browser clients.                                           |
| Cookie settings           | The cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/`, and marked `Secure` when the trusted connection metadata reports HTTPS.                                                                          |
| Credential lifetime       | Passwords exist only in gateway memory. Logout, the fixed eight-hour expiry timer, or graceful/process exit removes the live session; JavaScript strings cannot be actively zeroed.                          |
| Logs                      | Production logging redacts password, authorization, cookie, and `Set-Cookie` paths in addition to Fastify's metadata-only request serializer. Operators must not add unredacted custom logging.              |
| Error disclosure          | Login and network failures return fixed messages. Authenticated SoftEther JSON-RPC responses are returned to the browser because the console needs them.                                                     |
| TLS verification          | Upstream certificates are verified by default. Browser-facing TLS must terminate at the access-controlled reverse proxy.                                                                                     |
| Self-signed option        | Enabling it disables all certificate verification for the selected upstream, so it is appropriate only when that network path is trusted.                                                                    |
| Trusted proxy             | Proxy addresses must be listed precisely. `TRUST_PROXY=true` lets every direct client influence its reported IP and protocol, weakening rate limiting and cookie decisions.                                  |

Review the administrator access boundary and gateway egress rules whenever the
deployment or network boundaries change.

Each browser cookie identifies an independent session. A successful login from
an already authenticated browser replaces only that cookie's previous session;
a failed replacement login leaves the working session intact. Post-login
upstream failures return a fixed gateway error but do not remove the session,
because a temporary server restart or network interruption should remain
retryable. Sessions are not extended by activity and there is no shared or
persistent session store.
