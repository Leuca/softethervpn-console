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

`HOST`, `PORT`, `FRONTEND_ROOT`, and `TRUST_PROXY` configure the gateway process.

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
