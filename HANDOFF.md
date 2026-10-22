# Current handoff

Author: Ethan. Updated 2026-10-22.

Core CB-01 through CB-18 now pass. OpenRouter verified end to end. Claude SDK and CLI implemented; live Claude verification pending. No further paid tests are needed for this implementation. Ten actual OpenRouter task records report USD 0.001284948, with a possible unreported charge for one cancelled request. Two native Codex gpt-6-luna subscription attempts were used; the repaired integration passed. Per-task cap was USD 0.02. Credentials were transient and are not saved for the next session.

The capability audit fixed FIFO hangs, unlogged rejected MCP calls, nonpersistent failure enforcement, and cross-process tool-budget bypasses. Nine adversarial production CLI/MCP scenarios pass. Latest local suite: 51 pass, 22 external skips, zero failures. Seven separately opted-in live core scenarios pass; the packed 1.0.0 artifact also passed a real read after the final completion-ledger guard. Consult ACCEPTANCE.md and evidence/ for exact outcomes, including retained initial test-setup failures.

Release preparation and final clean-checkout verification are complete. Clean commit 68c76b2 passed npm ci, TypeScript checks, and the default local suite (50 pass, 23 explicit skips). PR #1 is the release vehicle; GitHub merge and publication follow these verified gates. Inspect GitHub for the current merge/tag state. The implementation is CLI/MCP only. No frontend or extra provider was introduced. Claude CB-19 through CB-24 remain explicitly unverified and do not block the authorized core-only release.

Keep GitHub Actions disabled, preserve ~/.codex/config.toml, and do not alter the parent repository. Package and Git author identity are Ethan. Both optional workers are stopped. Check account usage through the supported tool during active work; the current session monitor is not a persistent daemon.

---

# Historical work log

# Codex Subagent Bridge handoff

Author: Ethan. Updated 2026-10-22.

Repository: https://github.com/Ethant35/codex-subagent-bridge
Local path: /Users/ethantarnarider/Documents/ChatGPT/Open source/codex-subagent-bridge
Branch: codex/bridge-v1. Initial commit: a7efb38.
Goal: ACTIVE, core v1.0 NOT DONE. No release exists.

GitHub auth and origin verified. Repository Actions disabled with the repository permissions API; no workflows existed. Do not enable Actions or create workflows. Do not edit ~/.codex/config.toml. Parent directory is a separate repository.

Implementation started: strict TypeScript, Node 22+, MCP stdio, official Claude SDK and CLI, OpenRouter REST, atomic local run records, private workspace copies, exact file allowlists. No model-callable shell or network tools. Core owner is the primary chat; optional Luna workers have bounded ownership.

Environment: Node 22.13.1, npm 10.9.2, Codex CLI 0.163.0. Claude CLI absent; OPENROUTER_API_KEY and Claude credential variables absent. Live OpenRouter gates and Claude CB-19..24 are externally blocked. Do not manufacture pass records. Claude SDK subscription login is restricted by current official policy; implement API SDK mode and explicit CLI credential selection.

Checks: repository inspection only so far. Remaining: implementation, local E2E, documentation, reviewable PR, live gates, merge/release if gates pass. No project subprocess is currently active.

Next commands: cd into the local path above; npm ci; npm test; inspect ACCEPTANCE.md and git status. Check account usage before expensive work. Stop if any applicable usage window has 100% used; interrupt workers and save this handoff when tools remain available.

## Implementation milestone

Core implementation and both bounded worker assignments are integrated. Worker process-control regression now covers a descendant that ignores TERM and closes its pipes. Both workers are stopped. Latest local baseline: 33 E2E passed before six additional CLI checks and 17 explicitly skipped live scenarios were added; rerun npm test for current counts. npm audit found zero vulnerabilities. Real OpenRouter catalog confirms openai/gpt-4.1-mini tool support; no inference was performed. SQLite now coordinates two active slots across processes. Official Claude bare mode cannot reuse subscription login, so CLI subscription omits bare and applies explicit restricted/discovery controls.

Recurring authoritative usage checker is active in the primary tool session, every 55 seconds, using get_usage_limits. Last observed usage was 8% used, no exhaustion. This checker is session-scoped, not a persistent system daemon. Next: final E2E/clean-package checks, acceptance matrix and evidence, meaningful commits, push and attach review PR. Live credentials remain external blockers; do not merge/release.

## Review milestone, 2026-10-22

Implemented CLI/MCP, OpenRouter loop, Claude SDK and CLI adapters, exact path broker, SQLite concurrency, atomic JSON run records, real-process supervisor, and public documentation. Latest result: 62 E2E sub-scenarios, 39 PASS, 23 BLOCKED_EXTERNAL skips, 0 FAIL. TypeScript check passes; production dependency audit has zero findings. Clean local checkout and packed archive install pass at 3f1448766212219eee0511e28f97a85c77d519f6; see evidence/clean-install.txt. Later code changes are separately checked by the latest suite. Package metadata author and Git author are Ethan; MIT license unchanged.

Remaining release gates: live OpenRouter read/edit/unique-instruction/concurrency/provider-failure tests; native Codex-to-OpenRouter result consumption; actual provider cancellation; live Claude CB-19..24. No provider credentials available; do not claim core completion, merge main, or create release. Draft review PR next. No GitHub Actions runs (repository permission enabled:false; total_count:0). Both Luna workers stopped. No live provider inference occurred.

Exact next-session commands (after checking account usage):

```sh
cd '/Users/ethantarnarider/Documents/ChatGPT/Open source/codex-subagent-bridge'
git status --short
git log -3 --oneline
npm ci
npm run check
npm test
gh api repos/Ethant35/codex-subagent-bridge/actions/permissions
```

Once OPENROUTER_API_KEY is supplied securely to the process environment, run `CPB_LIVE_OPENROUTER=1 CPB_LIVE_CODEX=1 npm test` and record real outcomes. Claude maintainer instructions are in CONTRIBUTING.md. No secrets should be pasted into chat or committed. The usage checker is scoped to the current tool session and must be restarted in a future session.

## Published review state

Draft PR: https://github.com/Ethant35/codex-subagent-bridge/pull/1 (attached to this chat). Branch is pushed. Implementation/evidence head before this handoff-only update: 2732f139a91ff0310d83334305c761966ea5ffaf. Use `git rev-parse HEAD` for the current documentation head. Main is unchanged, no release exists, and Actions is disabled with zero runs.

Goal remains unfinished. External blocker audit: first goal turn, missing OpenRouter credentials and Claude account/CLI. All credential-independent work performed in this turn is complete and reviewable. Do not mark the goal complete. The exact native parent/live OpenRouter release gate is still untested. Future blocked turns must recheck whether credentials or authorized account access changed; do not repeatedly rerun the same local suite without new evidence.

No project subprocess or implementation worker remains active after validation. The session-scoped usage checker is stopped when this work turn ends; restart it before further active work. Last observed account window was 15% used (85% remaining), so this stop is due to external verification blockers, not quota exhaustion. Temporary clean-checkout/install directory was removed after its evidence was saved. No user config file was edited.

## Second goal turn: local lifecycle and real provider-failure audit

The same external credential blocker remains (second consecutive goal turn). This turn made concrete progress: fixed cancellation after synchronous snapshot preparation by checking the persisted cancel marker before provider submission/publication; ensured scheduler slots release even if final record persistence fails. Added real production CLI E2E for cancellation, two active tasks, third-task queueing, cancellation, and slot reuse. Real OpenRouter invalid-synthetic-key request returned AUTH_FAILED; no valid credential or paid inference was used. No provider success was simulated.

Final command for this milestone: `CPB_NETWORK_E2E=1 npm test`: 64 sub-scenarios, 42 passed, 22 blocked external skips, zero failures. Default npm test additionally skips the explicitly optional network failure case. CB-10 local cancellation and CB-12 provider failure now pass; CB-11 local concurrency passes but successful live child results remain blocked. Remaining essential blockers are real OpenRouter success and native Codex child-result consumption; Claude live access remains unavailable. PR #1 remains draft, no merge/release. Restart the supported 55-second usage checker for future active work; no persistent checker daemon is installed.

## Third goal turn: BLOCKED

The supported goal tool now records status BLOCKED after the same missing-access condition persisted across three consecutive goal turns. Live recheck confirmed OPENROUTER_API_KEY and Claude credentials remain absent; official Claude CLI is unavailable. SDK diagnostics still import and initialize setup successfully without inference. Current implementation commit: 5232f515a270eccc1e0e273bedd7ecc78d0dad10. PR #1 is open and draft. Latest evidence remains 42 passing, 22 external skips, zero failures; no repeated local test run was needed because no code changed in this audit.

Core v1.0 is NOT DONE. Resume requires an authorized OpenRouter key in the launching environment to verify successful child read/edit/unique instruction/concurrency and the native Codex-to-child-to-parent result. Claude live CB-19..24 also need an authorized account and, for CLI tests, the official executable. No legitimate provider access can be inferred from a successful invalid-key failure test. No merge, tag, or release has been created. Actions remains disabled and has zero runs.

No implementation workers or project subprocesses remain running. The supported usage checker is stopped after this final handoff; its last read showed 19% used, 81% remaining. Stop was caused by external verification blockers, not account exhaustion. Restart usage checks every 55 seconds when active work resumes. The working branch is codex/bridge-v1; use the commands above and record new live evidence before changing release status.


## Current work: authorized live access and capability hardening

Ethan supplied OpenRouter access and authorized economical live tests, preferring deepseek/deepseek-v4.1-flash-1017. The key is supplied to test launchers over a terminal with echo disabled and held only in process memory/environment; it is not written to repository files or command arguments. Native Codex login reports ChatGPT authentication. No Claude access was added.

The focused be-ambitious audit reproduced six broker failures and fixed regular-file validation, durable tool denials, persistent failure enforcement, and shared tool-step accounting. Nine focused scenarios and the full local suite passed (51 pass, 22 external skips). Live OpenRouter read has now passed and reported USD 0.00011981. Further live gates are running; do not infer their result from this interim note. The original missing-OpenRouter-access blocker is removed. Each live task is capped at USD 0.02. Sanitized actual run/events evidence is retained in evidence/live. Do not repeat paid successful cases without a new reason.
