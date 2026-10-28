# Setup and review before apply

Author: Ethan. Checked 2026-10-28 (America/Los_Angeles).

This is the unreleased 1.3.0-dev.0 source update. Published v1.2.1 and its archive, tag, and qualification records remain unchanged. The new workflow has offline evidence only. No model request, subscription parent run, or paid integration test was authorized or performed.

## Behavior

First-use guidance keeps the direct CLI path first and labels Codex connection as optional. Missing OpenRouter credentials include a zsh hidden-input command. Existing folders without task.json get a corrective action that preserves their files. Human and JSON output retain their existing defaults.

Tasks may set reviewBeforeApply or use --review-before-apply on task/run. Successful provider execution retains a private, bounded proposal in AWAITING_REVIEW. CLI review displays exact before/after bytes, including binary base64. Apply requires its token and rejects changed task authority, staged files, backups, and conflicting source edits. Discard never writes source. A per-run exclusive lock serializes decisions. New source checks before each publication reduce changes between preflight and file writes. Interrupted multi-file application keeps the existing recovery journal and originals. No apply/discard MCP tools are exposed.

Existing envelopes keep automatic publication. The new code reads old run records. v1.2.1 cannot read the new states or optional task field; use a separate CPB_HOME for evaluation. The token is a proposal identity check, not proof of human approval. The single-user trust boundary, per-file atomicity, and lack of OS compare-and-swap protection against arbitrary concurrent writers remain explicit.

## Claude reassessment

Official pages were read on the date above:

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview): third-party product subscription login/rate-limit use requires prior approval.
- [Claude Code authentication](https://code.claude.com/docs/en/authentication): official CLI sign-in methods; this alone does not establish bridge approval.
- [CLI reference](https://code.claude.com/docs/en/cli-reference): restricted mode, explicit tools, strict MCP configuration, and authentication status.

The conservative product decision is to block subscription delegation for both CLI and SDK. API-key adapters remain implemented but experimental and live-unverified. Diagnostics distinguish dependency/setup availability from authenticated inference. The pinned dependency and provider routes were not expanded.

## Verification

Node 22.13.1, macOS arm64. Typecheck and build pass. The complete suite reports 188 tests: 165 pass, 23 existing external checks skipped, zero failures. The 26 new tests cover persistent review, apply/discard, exact display, binary/control characters, empty proposals, changed source and staged bytes, task/path injection, symlinks, simultaneous decisions, interrupted writes, mid-publication conflicts, setup guidance, duplicate authorized paths, old automatic mode, CLI and MCP pending-review success, and Claude credential policy. Provider responses in these tests are synthetic; no real request is made.

Dependency audit reports zero vulnerabilities. GitHub Actions remains disabled. The current-change floor guard is clean. Against v1.0.0, the guard still reports the historical MCP discovery assertion change in tests/cli.test.mjs: the expected list gained cpb_prepare in the earlier release. This update does not modify any existing test or skip, and preserves that assertion. No suppressions or floor exemptions were added. Current changes received focused manual boundary review; no new Semgrep scan or blanket security certification is claimed.

Local package evidence is retained under .readiness-backups/review-2026-10-28. Installed tests use the packed runtime with isolated synthetic data and no live opt-ins. The package is a development candidate, not a public download or new live-qualified release. The final package summary records its hash, installed checks, runtime-file comparison, and cleanup.
