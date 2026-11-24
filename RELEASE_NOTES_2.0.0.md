# SoftEther VPN Console 2.0.0

## Highlights

- Keep multiple managed connections open. Switching restores the last page,
  Virtual Hub, and URL-backed tab for that connection. Pending edits prompt
  before being discarded; disconnecting one server leaves the others open.
- Managed login no longer zooms on iPhone field focus and better supports
  filling server and Virtual Hub credentials with password managers.
- Node.js 26 joins Node.js 22 and 24 as a supported release line.
  Release bundles are built with Node.js 24.

## Breaking changes

- The managed gateway no longer serves the unscoped `/api/` endpoint.
  A successful `POST /login` returns a connection ID; RPC requests use
  `/api/connections/:id/rpc` and the matching connection cookie. Session
  lookup and logout are also scoped to the connection. The old endpoint is
  not retained because requests need to identify their destination explicitly
  to prevent one connection from receiving another's commands. The native
  SoftEther `/api/` endpoint used by integrated mode is unchanged.
- On servers without conditional ACL writes, you can still view, create, and
  clone Access List rules. Editing, toggling, or deleting an existing rule
  requires a server with conditional writes. The console no longer falls back
  to a write that could silently overwrite another administrator's changes.

## Upgrade and rollback

Replace the managed frontend and gateway together, then restart the gateway.
All existing gateway sessions end. Reload open console tabs and sign in again.
If the reverse proxy restricts paths, allow `/login` and the scoped
`/api/connections/` routes. Keep the existing HTTPS and administrator access
controls in place.

To roll back, restore both 1.0.0 components together, restart the gateway,
reload open tabs, and sign in again. No console database or gateway state
needs migration. Changes already saved to a VPN server are not undone by
switching console versions.
