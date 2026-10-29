# Completed v1.3.1 release and cleanup

Author: Ethan. Updated 2026-10-29 (America/Los_Angeles).

## Result

Stable latest release: [v1.3.1](https://github.com/Ethant35/codex-subagent-bridge/releases/tag/v1.3.1). [PR #11](https://github.com/Ethant35/codex-subagent-bridge/pull/11) merged the UX fixes; [PR #12](https://github.com/Ethant35/codex-subagent-bridge/pull/12) merged the release. Publication records and this handoff are committed separately so the tested archive and tag remain immutable.

- Parent aliases in CPB_HOME no longer cause internal workspace path failures. Store-directory symlinks and unsafe permissions remain blocked.
- Review results expose proposedPaths separately from published changedPaths, including human output and persisted history.
- Claude support.apiKeyStatus stays visible without weakening credential redaction.
- Update instructions point to v1.3.1 and retain rollback warnings. CLI and both MCP server versions match the package; a regression checks this.

## Verification

Clean-source commit: `20e43708e89e306668b767c375a1950f2809365d`. Annotated v1.3.1 tag target: `c18f583236bc355ab05e2391af9824f54dbedb0e`. Package, Git and tag author: Ethan.

Archive: `codex-subagent-bridge-1.3.1.tgz`, 241663 bytes, 190 files. SHA-256: `7658940b1127e0d3a8c7f7d368c177ab7e73a2b0785da76248ff5069502f9e12`. GitHub asset digest and anonymous public download match. The documented public-URL install matched all 190 package files. All 51 runtime files matched the clean candidate build.

Type checking and the full clean suite passed: 170 tests passed, 23 existing external skips, zero failures. The candidate passed 28 installed review tests; the public installation passed 94 CLI/MCP, review, setup, and storage regressions. Seven installed upgrade/restart/backup/corruption/restore/rollback/uninstall checks passed from v1.3.0, with zero provider fetch attempts. Audit: zero vulnerabilities. Test-floor check against the release base was clean. Dependencies and licenses are unchanged. GitHub Actions remains disabled.

Terra independently retested the three fixes before release using an installed candidate and synthetic provider responses. Its report and transcripts are preserved locally under `.readiness-backups/ux-fixes-2026-10-29/terra-report/`. During release preparation, checks caught stale CLI/MCP version identifiers; they were corrected and the clean suite rerun. An initial npm cache miss was resolved by fetching dependency metadata into the disposable cache. Failure logs were retained. No fresh full Semgrep scan was performed; historical scan limits remain documented.

## Scope and future work

No paid calls, real credentials, live-provider requests, native Codex parent runs, or global configuration changes were used. Qualification remains offline/synthetic on macOS arm64 / Node 22.13.1. Historical OpenRouter/native evidence is from v1.2.1. Claude API-key adapters remain experimental; subscription routes remain blocked. Future live tests need fresh authorization.

No requested release work remains. Both prior usage-based stops were explicitly disabled by Ethan; no usage guard or recurring job is active. No active goal record exists. Do not resume work automatically.

## Cleanup and retained records

Owned test/build/install processes have exited. Disposable install homes, dependency caches, test workspaces, the old independent-review scratch directory, and this checkout's generated node_modules/dist were removed. Reviewers are stopped. Completed PR attachments are cleared from this chat; the PRs and release remain on GitHub. No managed worktree was attached.

Root release/publication records and `evidence/production-1.3.1/` hold final evidence. Prior root records and the old long handoff are preserved in `release-history/v1.3.0/`. Raw logs and sealed archive copies remain under ignored `.readiness-backups/`; static-analysis evidence is retained. Unrelated `README 2.md` and `PUBLICATION_VERIFICATION 2.json` are preserved. Source remains ready for a future local `npm ci` and build; no global install was created.
