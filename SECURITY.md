# Security Policy

## Supported versions

This repository publishes an adaptation of YouTube Digest. Reports should refer to the latest release and include the affected version. The upstream author does not maintain this adaptation.

## Report a vulnerability privately

Do not publish vulnerability details, exposed credentials, private video information, or transcript data through a public issue or pull request. This repository does not accept public security reports.

If GitHub's **Security → Report a vulnerability** option is available for this repository, use it for private security reports. If it is unavailable, do not publish exploit details or credentials in Issues. Keep reproductions redacted and never include actual API keys, private video URLs, browser profiles, transcripts or notes. Revoke an exposed provider key directly in the provider dashboard.

## High-priority issues

Examples include:

- API keys or private content included in source, logs, screenshots, or release ZIPs;
- requests to network origins outside the documented X, Supadata, and DeepSeek hosts;
- script or HTML injection through transcript, metadata, service errors, or model output;
- access to browsing data outside the documented X scope;
- unintended transmission of notes, transcripts, or credentials;
- a dependency or release-workflow compromise; and
- bypasses of local data deletion or DeepSeek configuration controls.

## User security guidance

- Install only from a GitHub source or release you trust.
- Review changes and the packaged file list before loading an update.
- Use dedicated, scoped API keys where possible and set provider spending limits.
- Do not reuse keys from production systems.
- Revoke keys immediately if a device, browser profile, ZIP, log, or screenshot exposes them.
- Remember that Chrome local extension storage is not an encrypted password vault.

Packaging uses an explicit public-file allowlist. Review the files you distribute; local browser profiles, API credentials and private media must remain outside the project.
