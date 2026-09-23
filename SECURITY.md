# Security policy

Funes Vault stores private personal context. Please report vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/bereciartua/funes-vault/security/advisories/new).
Do not post personal data, credentials, recordings or a working exploit against a
real vault in public issues. Use synthetic data and describe affected versions,
reproduction steps, expected behavior and the privacy impact.

The maintainer aims to acknowledge reports within seven business days and provide
an initial assessment within fourteen days. Disclosure timing is coordinated with
the reporter after a fix is available. Only the latest release is supported during
0.x development; deploy fixes promptly and retain private backups before upgrades.

See [the threat model](docs/threat-model.md) for supported deployment assumptions.
Self-hosted operators remain responsible for TLS, host and database access, backups,
provider credentials and access to their reverse proxy.
