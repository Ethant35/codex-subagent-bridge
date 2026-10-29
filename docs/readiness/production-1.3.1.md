# v1.3.1 release verification

Author: Ethan

This patch ships the three fixes from PR #11 and updates the release installation links. The prior [independent installed retest](ux-fixes-2026-10-29.md) verified the implementation using synthetic responses. The release procedure repeats clean-source installation, type checking, the complete offline suite, installed regression tests, and the installed upgrade/backup/restore/rollback/uninstall drill. Public verification downloads the released archive, checks its SHA-256 and every installed package file, and repeats the setup and installed regression checks.

The final archive hash, tag/source commits, measured counts, and public-install outcomes are recorded in the repository root `RELEASE_ARTIFACT.json` and `PUBLICATION_VERIFICATION.json`, with concise evidence under `evidence/production-1.3.1`. Those records are written after sealing the package and are not bundled in it. Prior root records remain under `release-history/v1.3.0`.

Scope remains macOS arm64 / Node 22.13.1 for a trusted single user. Current verification is offline/synthetic; no new paid inference, native parent, or live-provider claim is made. Historical OpenRouter/native Codex evidence is from v1.2.1. Claude API-key adapters remain experimental and subscription delegation remains blocked. GitHub Actions stays disabled, dependencies are unchanged, and global configuration is untouched.

Review records may omit `proposedPaths` when created by an older version. For an older pending proposal, use `cpb review` for its exact edits. `changedPaths` continues to mean published edits. Review is optional; automatic publication remains the default for existing envelopes. v1.2.1 cannot inspect review states/envelopes; preserve complete stopped-store backups before any rollback.

The v1.3.0 Community Semgrep scan remains historical evidence, including its upstream rule errors and lack of cross-file analysis. This patch uses focused manual review and permission, redaction, and path regressions; no fresh full static scan is claimed.
