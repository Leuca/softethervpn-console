# Managed gateway security review

The pre-1.0 gateway is intended for trusted administrators on controlled
networks. It is not yet suitable as an unrestricted public login service.

| Area                      | Current handling                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-selected upstream    | Login accepts any host and port. Keep the gateway private and restrict its network egress until the destination policy is completed.                                                                             |
| SSRF and private networks | The selected address can reach services visible to the gateway. Firewall and routing rules must limit that reachability.                                                                                         |
| DNS rebinding             | Hostnames are resolved again for later requests and are not pinned after login. Use trusted DNS and egress controls; destination pinning belongs to the destination-policy work.                                 |
| Login brute force         | Each client address gets ten login attempts per minute. The limit is process-local, resets on restart, and does not replace reverse-proxy rate limiting for exposed deployments.                                 |
| Request size              | Fastify rejects bodies over 1 MiB before a route handler runs.                                                                                                                                                   |
| JSON-RPC proxy            | Only authenticated `POST /api/` requests are forwarded. The upstream path, method, authentication headers, and HTTPS transport are fixed; arbitrary SoftEther RPC methods remain available to the administrator. |
| Session fixation          | Login creates a new 256-bit random session ID and invalidates the previous cookie's session after a successful probe.                                                                                            |
| CSRF                      | Cookies use `SameSite=Strict`; state-changing requests with a mismatched `Origin` are rejected. Requests without `Origin` remain available to non-browser clients.                                               |
| Cookie settings           | The cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/`, and marked `Secure` when the trusted connection metadata reports HTTPS.                                                                              |
| Credential lifetime       | Passwords exist only in gateway memory. Logout, the fixed eight-hour expiry timer, or process exit removes the live session; JavaScript strings cannot be actively zeroed.                                       |
| Logs                      | Default request logs contain request metadata, not bodies or authentication headers. Operators must not add body, cookie, or header logging.                                                                     |
| Error disclosure          | Login and network failures return fixed messages. Authenticated SoftEther JSON-RPC responses are returned to the browser because the console needs them.                                                         |
| TLS verification          | Upstream certificates are verified by default. Browser-facing TLS must terminate at the reverse proxy.                                                                                                           |
| Self-signed option        | Enabling it disables all certificate verification for the selected upstream, so it is appropriate only when that network path is trusted.                                                                        |
| Trusted proxy             | Proxy addresses must be listed precisely. `TRUST_PROXY=true` lets every direct client influence its reported IP and protocol, weakening rate limiting and cookie decisions.                                      |

The remaining high-risk gap is unrestricted upstream selection. Complete the
destination policy before widening the supported deployment boundary.
