# Support policy

SoftEther VPN Console 1.0.0 supports the combinations below. "Best effort"
means that fixes are welcome but do not block a release. Everything else is
unsupported unless stated otherwise.

| Area                  | Supported for 1.0                                                                                                        | Best effort or unsupported                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| SoftEther             | Stable 4.44 Build 9807 and Developer 5.02 Build 5188, including later compatible builds in those lines                   | Other JSON-RPC builds from 4.30 Build 9696 are best effort; older builds are unsupported                   |
| Modes and roles       | Standalone server, VPN Bridge, cluster controller/member, server administrator, and standalone Virtual Hub administrator | Anonymous, client-user, and operating-system account access are unsupported                                |
| Browsers              | Latest two major Chrome, Firefox, Safari, and Edge versions at release time                                              | Other modern browsers and mobile browsers are best effort; legacy browsers are unsupported                 |
| Integrated deployment | `build:integrated` artifact served by SoftEther with the correct `ASSET_PATH`; host OS and CPU are unrestricted          | Modified artifacts, cross-origin RPC, and unrelated web servers are unsupported                            |
| Managed deployment    | Maintained Linux on x86-64 or ARM64, Node.js 22 or 24, one gateway process, and a trusted HTTPS reverse proxy            | Other platforms and proxies are best effort; multi-instance and high-availability gateways are unsupported |

Feature visibility follows the authenticated role and SoftEther's `GetCaps`
response. A supported server may therefore expose only a subset of the console.

Integrated mode must remain same-origin. Managed mode should verify the
SoftEther certificate; its explicit self-signed option is supported for trusted
private servers. The 1.0 managed gateway is intended for controlled networks.

Compatibility reports should include the console artifact and version,
SoftEther edition/build and mode, administrator role, browser, and managed host
details when applicable. Never publish credentials, cookies, or private keys.
See the [real-server validation record](REAL_SERVER_VALIDATION.md) for current
release evidence and untested matrix rows.
