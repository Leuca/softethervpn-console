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
| Login brute force         | Each client address gets ten login attempts per minute. When a process has 10,000 active client windows, new addresses wait until a window expires. Restart clears these quotas. Use reverse-proxy rate limiting as well. |
| Request size              | Fastify rejects bodies over 1 MiB before a route handler runs.                                                                                                                                               |
| Upstream responses        | Login probe responses are limited to 16 KiB with a 15-second request deadline. Authenticated RPC responses are limited to 16 MiB with a six-minute request deadline and a five-minute socket idle timeout. |
| JSON-RPC proxy            | Only `POST /api/connections/:id/rpc` with the owning browser cookie is forwarded. The upstream path, method, authentication headers, and HTTPS transport are fixed. Socket pooling is disabled so each request uses its session's pin. |
| Connection ownership      | Each login issues an independent random connection ID and secret. The gateway verifies the secret against that ID before forwarding, even if a client sends a cookie outside its intended path. |
| CSRF                      | Cookies use `SameSite=Strict`; state-changing requests with a mismatched `Origin` are rejected. Requests without `Origin` remain available to non-browser clients.                                           |
| Cookie settings           | Each cookie is `HttpOnly`, `SameSite=Strict`, scoped to its connection's API path, and marked `Secure` when trusted connection metadata reports HTTPS. Logout clears only that cookie. |
| Credential lifetime       | Passwords exist only in gateway memory. Logout, the fixed eight-hour expiry timer, or graceful/process exit removes the live session; JavaScript strings cannot be actively zeroed.                          |
| Live session capacity     | One managed gateway process admits up to 128 live sessions by default, shared across all clients and upstreams. At capacity, a valid new login gets HTTP 503 with a 60-second retry hint and no cookie. Existing sessions stay valid; logout or expiry frees a slot. This limits stored sessions, not in-flight probes or total memory. |
| Logs                      | Production logging redacts password, authorization, cookie, and `Set-Cookie` paths in addition to Fastify's metadata-only request serializer. Operators must not add unredacted custom logging.              |
| Error disclosure          | Login and network failures return fixed messages. Authenticated SoftEther JSON-RPC responses are returned to the browser because the console needs them.                                                     |
| TLS verification          | Upstream certificates are verified by default. Browser-facing TLS must terminate at the access-controlled reverse proxy.                                                                                     |
| Self-signed option        | Enabling it disables all certificate verification for the selected upstream, so it is appropriate only when that network path is trusted.                                                                    |
| Trusted proxy             | Proxy addresses must be listed precisely. `TRUST_PROXY=true` lets every direct client influence its reported IP and protocol, weakening rate limiting and cookie decisions.                                  |

Review the administrator access boundary and gateway egress rules whenever the
deployment or network boundaries change.

Each connection has its own browser cookie. The document URL identifies
one connection, not a credential. Opening the console root in another tab can
add a connection; neither a successful nor a failed login retargets existing
tabs. Logout and the fixed eight-hour expiry revoke only that connection.
A request already forwarded cannot be recalled. Reconnecting creates a new ID.
The store is in memory; gateway restarts require fresh logins.
