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
