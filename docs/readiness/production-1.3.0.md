# Release 1.3.0 verification

Author: Ethan. Date: 2026-10-28 (America/Los_Angeles).

This release adds optional review before apply, clearer setup, and a conservative Claude subscription policy. PR8 was reviewed and merged. Review found and fixed a race between staged-hash validation and publication: apply now publishes the verified buffers, not a later reread. The regression changes staging after validation and confirms exact reviewed bytes are applied.

The supported measured environment is macOS arm64 with Node22.13.1, for one trusted local user. The complete suite passes166 tests with23 existing external skips. Typecheck/build and installed CLI/MCP tests use synthetic data and responses. No fresh model calls or native Codex parent runs were authorized. OpenRouter live evidence remains from v1.2.1; Claude API-key adapters remain experimental/live-unverified. Both Claude subscription delegation paths are blocked pending prior provider approval.

Semgrep Community1.182.1 ran all8 approved groups with metrics off:6 complete,2 partial due upstream Elttam/Apiiro rule errors. Eleven heuristic findings (3warnings,8informational) were reviewed without a blocking defect identified. Failed/skipped/coveredNothing/oversized lists are empty. The scan covers the repaired PR8 code; subsequent release-version, documentation, and operations-script parameter changes received manual review. No cross-file or blanket security claim. See the [static review record](../../evidence/production-1.3.0/static-review.json).

The current-change floor guard is clean. Its v1.0.0 comparison retains the historical MCP discovery assertion notice from adding cpb_prepare; no old test or skip was weakened. Dependencies and licenses are unchanged; the lockfile only changes package version. No new performance or assistive-technology qualification is claimed.

Release qualification builds a clean source export, installs its package in an isolated home, compares runtime hashes, runs the27 review/setup tests against installed code, and checks upgrade/restart/backup/corruption/restore/rollback/uninstall from public v1.2.1 without inference. Public downloaded bytes must match the sealed candidate before stable promotion. Root RELEASE_ARTIFACT.json and PUBLICATION_VERIFICATION.json record final hashes and results after packaging; they are excluded from the package to avoid self-referential hashes. Prior v1.2.1 records and assets remain historical and unchanged.

Review output intentionally contains exact private source contents. Apply requires a proposal token and checks conflicts; it remains atomic per file and assumes a trusted local user. Back up the entire stopped store. Older v1.2.1 cannot read new review records; use a separate CPB_HOME for evaluation or a pre-upgrade backup for rollback. See [review workflow](../review-before-apply.md), [Security](../../SECURITY.md), and [Operations](../../OPERATIONS.md).
