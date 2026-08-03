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
proxy. There are no environment overrides for the eight-hour session lifetime
or five-minute SoftEther request timeout.

## HTTP and reverse proxy

The gateway is HTTP-only and listens on loopback by default. Do not expose it
directly to untrusted networks. Terminate public HTTPS at a trusted reverse
proxy and redirect public HTTP to HTTPS there.

The proxy must preserve `Host` and set `X-Forwarded-For` and
`X-Forwarded-Proto`. The connecting proxy address must match `TRUST_PROXY`.
`X-Forwarded-Proto: https` causes the gateway to mark session cookies `Secure`.

Example for Nginx on the same host:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Sessions and upstream TLS

Sessions use random opaque IDs in `HttpOnly`, `SameSite=Strict` cookies.
Administrator passwords and session state remain in gateway memory. Sessions
expire eight hours after login and are not extended by activity; logout,
expiry, or any gateway restart requires a new login. Only one gateway process
is supported because there is no shared session store.

The gateway always connects to SoftEther over HTTPS. Certificate verification
is strict by default. The login form's self-signed option disables verification
only for that trusted upstream server; it does not provide browser-facing TLS.
Login probes and proxied JSON-RPC requests share a five-minute upstream timeout.

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
- Gateway restarts intentionally invalidate every session.

Managed mode is intended for trusted administrators and controlled networks.
Do not expose its user-selected upstream address as an unrestricted public login
service until the destination-policy and gateway threat-review work is complete.
