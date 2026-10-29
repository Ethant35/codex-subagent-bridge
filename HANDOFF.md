# Completed v1.3.2 release and cleanup

Author: Ethan. Updated 2026-10-29 (America/Los_Angeles).

## Result

Stable latest release: [v1.3.2](https://github.com/Ethant35/codex-subagent-bridge/releases/tag/v1.3.2). [PR #14](https://github.com/Ethant35/codex-subagent-bridge/pull/14) merged the interoperability patch. Both parent MCP tools now return matching redacted structuredContent and text JSON. Existing task bounds, consent, file capabilities, review/apply/discard and cancellation behavior are unchanged.

The [frozen OpenRouter contract](docs/readiness/openrouter-final-contract.md) is complete through current verification and explicitly reused unchanged evidence. No active goal record exists, so no goal was recreated or marked complete. Both prior usage-based stops were explicitly disabled by Ethan; no usage guard or recurring job is active. Do not resume automatically.

## Verification and exact artifact

Source commit: ab253df138af9f6aae47465ad89a85e46affe31a. Sealed tag target: db571033a7a2c2565880c191a8b970bc5b699bcd. Archive: codex-subagent-bridge-1.3.2.tgz, 245001 bytes, 196 files, 51 runtime files. SHA-256: 918ce8790ab45916fe69acc1b56423323407a725c5d2c3fc76c728e151f252cd. Anonymous public download, GitHub digest and installed files match. Package, Git and tag personal author is Ethan. Post-publication records do not alter the tag or archive.

Clean type checking and source suite passed: 171 tests, 23 existing external skips, zero failures. The installed candidate passed 28 review tests; public install passed 95 CLI/MCP, setup, review and storage regressions. Dependency audit: zero vulnerabilities. Floor check passed; dependencies/licenses are unchanged. GitHub Actions is disabled. No fresh full Semgrep scan is claimed; historical limits remain documented.

One native Codex 0.165.0 / GPT-6.1 Sol Medium parent used cpb_prepare and cpb_delegate exactly once each and consumed the actual DeepSeek result. One task on deepseek/deepseek-v4.1-flash-1017 made three provider requests and three file-tool calls. Reported response cost: **$0.00013662**, within the $0.02 application cap; this is not an invoice reconciliation. Subscription usage is separate. Staging, exact review bytes/hashes, source-conflict refusal, read-only recovery, exact apply, original file mode, unrelated-file preservation, separate-process persistence and staging cleanup passed. Global configuration bytes are unchanged.

Two earlier separately approved Luna High parents stopped before inference: one could not extract the valid text-only prepared task, and one used an incorrect tool function name. Both transcripts are retained. Structured content is an additive interoperability improvement, not proof that the original text response violated MCP. The successful Sol run used temporary tool approval and explicit CPB_HOME forwarding. General reliability across native models, default approvals and Codex UI surfaces is not established. Every parent allowance and the single child allowance are consumed. No further paid test is authorized.

Cancellation reuses historical real-provider evidence and Terra's active synthetic CANCELLED check because the cancellation code is unchanged. Discard and recovery reuse public regression tests, Terra's retest and the seven v1.3.1 operations checks. No fresh paid cancellation or full v1.3.2 upgrade drill is claimed. This is maintainer integration evidence, not an unfamiliar-human usability study. Claude API-key adapters remain experimental/live-unverified; subscription routes remain conservatively blocked.

## Cleanup and retained records

The two owned disposable install homes, caches and synthetic workspaces were removed. Temporary account copies were removed; no API key was written into the project or evidence. Owned processes have exited. Generated node_modules/dist were removed. Reviewers are stopped. Completed PR attachments are cleared as the final app cleanup step; GitHub PRs and releases remain intact. No managed worktree was attached.

Final records: RELEASE_ARTIFACT.json, PUBLICATION_VERIFICATION.json and evidence/production-1.3.2. Sanitized successful and failed parent transcripts are included. Raw logs, local harnesses and sealed archives remain under ignored .readiness-backups; static-analysis evidence and prior release-history remain. Unrelated README 2.md and PUBLICATION_VERIFICATION 2.json are preserved. A future source build requires npm ci and npm run build. No global install or configuration change was made.
