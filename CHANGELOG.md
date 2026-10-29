# Changelog

## 1.3.2 — 2026-10-29

- Return matching redacted MCP structured and text results for preparation and delegation. Native parents can access task/result fields directly; existing text clients remain supported.
- Preserve provider, spend, permission, review/apply and cancellation behavior.


## 1.3.1 — 2026-10-29

- Resolve parent aliases in `CPB_HOME` before creating run workspace paths; still reject a symlink at the store directory or unsafe permissions.
- Add `proposedPaths` to review-mode run results and records. Keep `changedPaths` for files published to the project and show proposed files in human output.
- Expose Claude diagnostic support as `support.apiKeyStatus` so the status remains visible without relaxing credential redaction.
- Correct the Operations update command to v1.3.0 and explain the v1.2.1 rollback compatibility limit.

## 1.3.0 — 2026-10-28

- Add opt-in review before apply, persistent proposals, exact before/after display, token-bound apply, and discard.
- Reject changed proposals and conflicting project edits; retain per-file journals and originals after interrupted apply.
- Keep Codex connection optional in first-use guidance; show a hidden-input credential command and an existing-directory correction.
- Block Claude CLI subscription delegation pending provider approval, alongside the existing SDK block. API-key adapters remain experimental and live-unverified.
- Preserve automatic publication for existing envelopes. New review records require the new code; use a separate state directory for evaluation.

Offline verification only for this release; no new paid model calls. Live provider evidence remains historical from v1.2.1. See [release verification](docs/readiness/production-1.3.0.md).

## 1.2.1 — 2026-10-27

- Make `doctor --human` readable while preserving the JSON interface.
- Show provider-specific credential setup before a paid guided run when the credential is missing.
- Explain how to fix an authorized input path that does not exist.
- Avoid initializing the run store for setup and other commands that do not need persistent state.
- Add a repository-local, explicit-path verification procedure and journey map.

Local tests, installed-package operations, OpenRouter CLI and native Codex MCP checks passed on the supported platform. Consult the completed version1.2.1 `PUBLICATION_VERIFICATION.json` record for final public-download verification. See [Readiness](READINESS.md) and [Guided onboarding](docs/onboarding.md) for current evidence and support limits.

## 1.2.0

- Add a release-first, replayable CLI onboarding path with task and ID generation.
- Add project MCP preview and explicit trust, preserving unrelated settings.
- Require an explicit finite cap and spending consent for each guided run.
- Add read-only MCP preparation and opt-in human output for existing commands.
- Preserve experimental Claude and existing platform qualification limits.

Author: Ethan

## 1.1.0

- Replace source files atomically per file; retain original bytes and a progress journal for interrupted publication. Add read-only `recovery` inspection.
- Add private sample generation, offline task validation and reduced shareable diagnostics.
- Reject corrupt/unsafe state instead of hiding records; validate scheduler schema and preserve v1.0.0 upgrade compatibility. History now defaults to 100 results and supports exclusive cursors, with a maximum of 1,000 per page. Existing all-history clients must paginate.
- Fix FIFO hangs, slot reservation, cancellation polling and final persistence/cleanup error paths.
- Reject unknown provider pricing and malformed response shapes before further inference or tool execution. Accept structured pricing overrides using conservative token rates and an explicit zero request-price routing ceiling. Charged POSTs remain unretried.
- Add controlled fault, generated pagination, real CLI/MCP, offline backup/rollback, dependency, static-analysis and performance evidence. These checks do not substitute for live provider tests.
- Qualify only the recorded macOS arm64 / Node 22.13.1 local OpenRouter use. Claude remains experimental. Linux and other Node/platform combinations are not qualified by this release.

## 1.0.0

Initial bounded CLI/MCP bridge with OpenRouter live evidence and implemented, live-unverified Claude SDK/CLI adapters. See ACCEPTANCE.md for historical evidence.
