# Differential review against v1.0.0

Author: Ethan  
Review date: 2026-10-22  
Baseline: `5f3a3eb62b9e0341839a5c78ecdd2eb5c1859f0e`  
Review type: static source review of the complete working tree, including untracked source and tests. No tests, provider calls, scans, or commits were run for this review.

## Finding and resolution

**[P2] Task validation reports the wrong credential state for Claude subscription tasks.** In [`src/local-commands.ts`](../../src/local-commands.ts#L25), `credentialPresent` checks only `ANTHROPIC_API_KEY` for every Claude task. A valid CLI task with `credentialMode: "subscription"` uses an existing `claude.ai` login and must not have API credentials set; the provider explicitly rejects conflicting API credentials. `cpb validate` therefore reports `credentialPresent: false` for the supported subscription route even when that route is configured. This is a misleading readiness result. Report credential mode/source separately or avoid calling the API-key check a generic credential-presence result.

## Review scope and limits

The review compared changes from the v1.0.0 commit across the provider adapter, runner, workspace publication and recovery, file tools, store, CLI and new local commands, plus the added tests and release documentation. I traced the relevant input paths through task validation, provider requests, tool dispatch, publication, finalization, and recovery. I found no other actionable introduced finding within that scope.

This bridge is a trusted-local-user tool: the parent chooses the task and workspace, and local same-user modification of source or private state is outside its stated boundary. Claude remains experimental and live-unverified; this review does not establish compatibility with a Claude account or installed CLI. Those limits are not treated as code findings.

The working tree identifies itself as version 1.1.0. Its readiness and third-party notices disclose that installing the pinned Anthropic SDK also installs a separately licensed Claude Code runtime, and that this combined dependency set is not represented as MIT-only. This review did not re-audit license terms or reproduce the dependency inventory.

## Resumed verification

The P2 finding is fixed. Offline subscription validation now returns `credentialPresent: null`, `credentialStatus: "unverified"`, and `credentialSource: "subscription-login"`. API-key tasks retain a presence boolean and identify the expected environment variable. A real CLI regression covers both absent and present synthetic keys across OpenRouter API, Claude SDK/API-key, Claude CLI/API-key and CLI/subscription. The retained before test fails; the repaired six-test onboarding suite passes with no state directory created. Full suite: 100 passed, 23 explicit external skips, zero failures. TypeScript and floor guard pass.

The primary reviewer also read the resumed changes in storage, runner, publication, provider input handling, CLI and local commands. No additional release-blocking finding was identified in those paths. This is source review and controlled local evidence, not a proof of security, live Claude compatibility, or resistance to hostile same-user processes.

The final approved Community rescan completed eight rulesets. Five script advisories were reviewed: two matches in the floor guard are required regex literals, and three identify dense fixture/report objects in local verification scripts. They are not executable obfuscation or untrusted-input paths. No source-code suppression was added. Two third-party rulesets remain partial because of compiler errors, including one JavaScript switch-pattern rule. See `evidence/readiness/semgrep-final.json`.

The live catalog then exposed structured pricing overrides and an omitted request-price field. Review of the repaired path confirmed that invalid numeric/override values still block finite budgets, maxima cover every published conditional token rate, and every bounded POST enforces the documented zero request-price ceiling. No retry/fallback was added. Thirty controlled provider tests and the 113-pass full suite cover the repair; see provider-skills.md for the corrected earlier assumption and retained failed live evidence.
