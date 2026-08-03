# Versioning policy

SoftEther VPN Console uses [Semantic Versioning](https://semver.org/):
`MAJOR.MINOR.PATCH`, optionally followed by a prerelease identifier such as
`1.0.0-rc.1`.

The `0.x` series may change incompatibly when documented in its release notes.
The stable compatibility promise starts with 1.0.0.

## Stable behavior

From 1.0.0, the public commitments include the documented support matrix,
deployment modes and build commands, release artifacts, gateway configuration
and HTTP behavior, upgrade behavior, and user-visible administration workflows.
Internal source structure, component APIs, CSS, tests, and undocumented RPC
behavior are not public APIs.

| Change | Meaning                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Patch  | Compatible fixes, security updates, UI or documentation corrections, and dependency updates that preserve documented behavior |
| Minor  | Additive features, configuration, artifacts, or supported environments                                                        |
| Major  | Removal or incompatible change to a documented workflow, default, configuration, endpoint, artifact, or supported environment |

Security fixes may reject unsafe behavior in a patch release and must clearly
state any required operator action.

## Deprecation and upgrades

Planned breaking changes should be announced for at least one minor release,
with a replacement and earliest removal version, before removal in the next
major release. Urgent security or upstream compatibility fixes are exempt.

Release notes must describe operator-visible changes, required migration or
restart steps, session impact, and rollback. Tagged artifacts are immutable;
fixes and release-candidate updates are published as new versions.
