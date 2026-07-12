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

The gateway listens on HTTP only. Public HTTPS belongs to a reverse proxy,
platform router, or load balancer in front of the Node process.

The `allowSelfSigned` option is only for the upstream Node-to-SoftEther TLS
connection. It does not make the gateway a public TLS endpoint.
