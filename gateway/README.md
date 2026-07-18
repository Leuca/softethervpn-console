# Gateway design

The optional managed deployment backend lives in `gateway/`.

The gateway serves the managed frontend bundle, owns the login session, and
proxies same-origin API requests to the selected SoftEther VPN Server. It should
stay intentionally small: the React frontend keeps owning the console UI, route
visibility, and SoftEther page behavior.

## Framework

Use Fastify for the gateway.

Reasons:

- It has a small HTTP-focused core and does not push an application framework on
  the project.
- It is TypeScript-friendly without requiring a large amount of glue code.
- Route tests can use Fastify injection without binding a real network port.
- JSON body parsing and structured route hooks are built in.
- Cookie, static file, and proxy behavior can be added through focused
  dependencies as the gateway grows.

## Package boundary

The gateway should use its own package files under `gateway/`.

That keeps gateway runtime dependencies separate from the frontend Webpack
build. The frontend can continue to build integrated and managed static bundles
from the root package, while the gateway package can get its own type-check,
lint, and test commands when gateway code is added.

## Production deployment

Use the managed release archive, which contains the compiled frontend under
`dist/`, the compiled gateway under `gateway/dist/`, and the gateway package
metadata. After extracting it, install only the gateway runtime dependencies:

```sh
npm ci --omit=dev --prefix gateway
```

Run the gateway from the extracted archive root so its default frontend path
resolves to `dist/`:

```sh
NODE_ENV=production \
HOST=127.0.0.1 \
PORT=8080 \
TRUST_PROXY=127.0.0.1 \
node gateway/dist/server.js
```

Use a service manager such as systemd in production. Run the process as a
dedicated unprivileged account, restart it on failure, and send its standard
output and error to the system journal. Keep releases in versioned directories
and point a stable `current` symlink at the active version so upgrades can be
rolled back without modifying an extracted release.

The gateway exposes `GET /healthz` for local service checks. Verify it before
directing traffic to a new process:

```sh
curl http://127.0.0.1:8080/healthz
```

## HTTP and TLS boundary

The gateway listens on plain HTTP only, on `127.0.0.1:8080` by default. Do not
expose it directly to untrusted networks. Public HTTPS belongs to a reverse
proxy, platform router, or load balancer in front of the Node process. Redirect
public HTTP traffic to HTTPS at that layer.

The reverse proxy should preserve `Host` and send `X-Forwarded-For` and
`X-Forwarded-Proto`. The gateway trusts forwarding headers from `127.0.0.1` by
default. Set `TRUST_PROXY` to the proxy IP or CIDR when the proxy connects over
another interface. Set it to `true` only when every direct gateway connection
comes from a trusted proxy. When the trusted proxy sends
`X-Forwarded-Proto: https`, managed session cookies carry the `Secure` flag.

For example, when Nginx runs on the same host as the gateway:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

This configuration works with the default `TRUST_PROXY=127.0.0.1`. If Nginx
connects from another address or container network, set `TRUST_PROXY` to that
proxy address or trusted CIDR.

Gateway process configuration:

- `HOST` controls the listen address and defaults to `127.0.0.1`.
- `PORT` controls the listen port and defaults to `8080`.
- `FRONTEND_ROOT` overrides the managed frontend directory. The release layout
  resolves to its root `dist/` directory by default.
- `TRUST_PROXY` lists trusted reverse-proxy addresses or CIDRs and defaults to
  `127.0.0.1`.

## Session behavior

Managed sessions use random opaque identifiers in `HttpOnly`, `SameSite=Strict`
cookies. Cookies are marked `Secure` when a trusted proxy reports HTTPS through
`X-Forwarded-Proto`.

Sessions and administrator passwords are held only in gateway memory. Sessions
expire after eight hours, and restarting the gateway logs out every user. A
multi-process or multi-instance deployment therefore requires sticky routing or
a shared session store, neither of which is currently implemented.

## Upstream SoftEther TLS

The gateway always connects to the selected SoftEther VPN Server over HTTPS.
Certificate verification is strict by default. This is the recommended setting
for public servers and servers with certificates issued by a trusted private
certificate authority.

The `allowSelfSigned` option is only for the upstream Node-to-SoftEther TLS
connection. Enable it only for a trusted local or private SoftEther deployment
whose certificate cannot be verified normally. It disables upstream certificate
verification; it does not make the gateway a public TLS endpoint. Certificate
verification failures are reported during login before a session is created.

Browser-to-console TLS and gateway-to-SoftEther TLS are independent. A public
HTTPS reverse proxy does not change how the gateway verifies the SoftEther
server certificate.

## Current security scope

Managed mode is currently intended for trusted administrators and controlled
networks. The login form accepts a user-selected SoftEther server address, and
the gateway probes that address before creating a session. Do not expose this
pre-1.0 gateway as an unrestricted public login service.

Before broad public deployment, add an upstream destination policy, login rate
limiting, and explicit protection against using server selection to probe
internal network services. Complete a gateway threat review before treating
these interfaces as a stable public security boundary.
