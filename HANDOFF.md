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
