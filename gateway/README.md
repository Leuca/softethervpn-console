# Managed gateway

The managed gateway serves the managed frontend, owns login sessions, and
proxies same-origin `/api/` requests to the SoftEther server selected at login.
The frontend still owns capability detection and route visibility.

## Build and run

The managed release archive contains the frontend in `dist/` and compiled
gateway in `gateway/dist/`. After extracting it, install runtime dependencies:

```sh
npm ci --omit=dev --prefix gateway
```

Run the gateway from the archive root so the default frontend path resolves:

```sh
NODE_ENV=production \
HOST=127.0.0.1 \
PORT=8080 \
TRUST_PROXY=127.0.0.1 \
node gateway/dist/server.js
```

Use a service manager and a dedicated unprivileged account. Keep extracted
releases immutable and switch between versioned directories for upgrades and
rollback.

## Configuration

Configuration is read at startup. Changes require a gateway restart.

| Variable        | Default         | Behavior                                                                                      |
| --------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `HOST`          | `127.0.0.1`     | Listen address; an invalid or unavailable address prevents startup                            |
| `PORT`          | `8080`          | Integer from 1 through 65535; invalid values prevent startup                                  |
| `FRONTEND_ROOT` | archive `dist/` | Absolute managed frontend directory; it must exist at startup                                 |
| `TRUST_PROXY`   | `127.0.0.1`     | Comma-separated proxy IPs/CIDRs, or `true`; invalid entries prevent startup                   |
| `NODE_ENV`      | unset           | Set to `production` for deployed runtime dependencies; the gateway does not otherwise read it |

Never set `TRUST_PROXY=true` unless every direct connection comes from a trusted
proxy. The 1 MiB request limit, ten login attempts per client per minute,
eight-hour session lifetime, and five-minute SoftEther timeout are fixed.

## HTTP and reverse proxy

The gateway is HTTP-only and listens on loopback by default. It has no independent
user identity layer before the SoftEther login, and administrators may select
any syntactically valid upstream host and port. Do not expose it to the public
Internet without access control. Keep it on a private administrator network or
place it behind a VPN, reverse-proxy SSO, mutual TLS, or an administrator IP
allow rule. HTTPS by itself is not sufficient.

Terminate browser-facing HTTPS at the access-controlled reverse proxy and
redirect HTTP to HTTPS there.

The proxy must preserve the original host and port in `Host` and
`X-Forwarded-Host`, then set `X-Forwarded-For` and `X-Forwarded-Proto`. The
connecting proxy address must match `TRUST_PROXY`. `X-Forwarded-Proto: https`
causes the gateway to mark session cookies `Secure`. State-changing requests
whose `Origin` does not match this public origin are rejected. Requests without
`Origin` remain available to non-browser clients.

Example for Nginx on the same host:

```nginx
location / {
    # Replace this with the actual administrator network, or use auth_request
    # or mutual TLS for administrator access control.
    allow 10.0.0.0/8;
    deny all;

    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Sessions and upstream TLS

Sessions use random opaque IDs in `HttpOnly`, `SameSite=Strict` cookies.
Administrator passwords and session state remain in gateway memory. Sessions
expire eight hours after login and are not extended by activity; logout,
expiry, successful re-login from the same browser, or gateway shutdown
invalidates the old session. Separate browsers have independent sessions, and a
failed replacement login leaves the current session active. Post-login upstream
failures do not invalidate a session so temporary outages can be retried. Only
one gateway process is supported because there is no shared session store.

Production logs use Fastify's metadata-only request serializer and defensively
redact password, authorization, cookie, and `Set-Cookie` fields. Do not add
unredacted request-body or header logging. Login, gateway, and TLS failures use
fixed client-visible messages and do not include credentials or low-level error
details.

The gateway always connects to SoftEther over HTTPS. Certificate verification
is strict by default. The login form's self-signed option disables certificate
verification for connections to the selected upstream and is safe only on a
trusted path; it does not provide browser-facing TLS. Login probes and proxied
JSON-RPC requests share a five-minute upstream timeout.

At login, the gateway validates and normalizes the entered host, resolves a DNS
name once, and stores the complete initial address set in the session. Every
request in that session uses only those addresses; the hostname is not resolved
again. Shared HTTPS socket pooling is disabled so a connection from another
session cannot bypass this pin.

## Health and troubleshooting

`GET /healthz` returns `{"status":"ok"}` when the gateway process can serve
requests. It does not probe a SoftEther server. Check it locally before sending
traffic to a new process:

```sh
curl http://127.0.0.1:8080/healthz
```

- Startup failures usually indicate an invalid port, proxy entry, bind address,
  or frontend path.
- A cookie without `Secure` means the request did not arrive through a trusted
  proxy reporting HTTPS.
- Login `401` responses mean SoftEther rejected the credentials; `502` responses
  indicate network, TLS, timeout, or invalid upstream response failures.
- Login `429` responses include the remaining wait in `Retry-After`.
- Gateway restarts intentionally invalidate every session.

Managed mode is intended for trusted administrators behind the access boundary
described above. Network egress rules remain recommended as defense in depth.
See the [security review](SECURITY.md) for the complete boundary.
