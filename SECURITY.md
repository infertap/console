# Security

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Report it privately:

- Email `cort@infertap.ai` with `SECURITY` in the subject line. Include the analyzer version
  that serves the console (`infertap-analyzer --version` prints the console's version and
  content hash beside its own), the browser, what you did, and what an attacker gains.
- GitHub's private vulnerability reporting ("Report a vulnerability" under the Security tab)
  is the same channel and reaches the same people.

You will get an acknowledgement within three business days. We aim to confirm or refute the
report within ten, and to ship a fix in the next release, with a coordinated disclosure date
agreed with you, ninety days from the report at most and sooner when a fix is out. We credit
reporters in the release notes unless they ask otherwise.

## Scope

- The console: this repository's source and the bundle built from it, which the analyzer
  compiles into its binary and serves on its read API's address.
- The analyzer and the tap are separate repositories with their own policies. A finding in
  how the analyzer serves or authenticates the console belongs there.

## Supported versions

The console version pinned by the latest `1.x` analyzer release receives fixes. Older
bundles do not; upgrade the analyzer.

## What we already do

Dependencies are pinned exactly in a committed lockfile, install scripts are disabled, and
`npm audit` runs at high severity on every push. The build audits the bundle for external
loads, so an air-gapped browser renders it with nothing fetched from outside. Every server
interaction goes through one data layer, lint-enforced; no component calls `fetch` or opens
an `EventSource` itself. The analyzer verifies the bundle's content hash before embedding it.
