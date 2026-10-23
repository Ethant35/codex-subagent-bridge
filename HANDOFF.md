# Guided onboarding phase handoff

Author: Ethan. Updated 2026-10-22 (America/Los_Angeles).

Repository: https://github.com/Ethant35/codex-subagent-bridge
Branch: codex/guided-onboarding. Baseline 722105d (published v1.1.0 runtime).
Prior completed handoff preserved in ignored .readiness-backups/usability/HANDOFF-before.md.

## Authorization and guard

Ethan authorized implementation, tests, PR and accepted release for a guided CLI/MCP journey. No GUI or notarization needed. No GitHub Actions/global config changes. New phase goal active; prior goal complete. Usage checked immediately (46% used) and active functions cell 2 checks every55 seconds. Stop at >=90% used in ANY window; unknown stays unknown. Stop own workers/processes, save handoff, pause goal and checker, end. No credits/resets/provider/account bypass or automatic resume.

Up to TWO Luna High assistants authorized; assistants may not spawn agents. Root hands-on lead. Finished/stopped bounded workers: project_connect (src/project-connect.ts + tests/project-connect.test.mjs), onboarding_docs (README.md + docs/onboarding.md). Root owns guided commands, CLI integration, tests/evidence/release. Preserve their changes.

## Current plan and gates

Add start (safe sample/check), task (generated bounded envelope), connect (preview then explicit project config trust), run (explicit finite cap plus spending consent and fresh IDs). Preserve legacy JSON behavior; new commands human output with --json. MCP cpb_prepare generates zero-spend tasks. Keep original cpb_delegate contract. No routine UUID/JSON editing. No automatic paid retry.

At most THREE new live child checks, each application cap $0.02 (total application allocation $0.06), preferred authorized DeepSeek flash model; two completed calls, combined reported cost $0.000133344; one native Luna High parent succeeded. One local config-only launch failed before inference and one isolated no-auth launch returned401 before any child inference. Native Codex subscription tests bounded. No keys in files/argv/logs.

Completed: implementation;129 tests pass,23 external skips; types/build/audit; reviewed single floor discovery assertion change; clean install; first live task and native MCP parent; update/rollback/history/corruption/restore. Pending: final package inspection; PR attachment/merge/tag/release; downloaded-release repeat live task and final evidence. Do not claim completion with any gate open. Skills explicitly loaded: shipping-and-launch, api-and-interface-design, impeccable (context + onboard + craft-floor), baseline-ui, fixing-accessibility, systematic-debugging, verification-before-completion; OpenAI Docs for MCP project trust. Local skill provenance already recorded under docs/readiness.

Actions verified disabled with zero runs before edits. User config untouched. Memory quickpass no relevant hits.

## Working evidence

Temporary qualification directory is recorded in ignored .readiness-backups/usability/location.txt. It holds clean source, installed consumers, private test state and logs. The temporary Codex home contains an auth-file symlink to the existing authorized account, not copied credentials; unlink it during owned temporary cleanup. No key saved. Release records under evidence/usability preserve sanitized results and runtime hashes. Usage latest63% used/37% remaining. Both assistants stopped. Global config SHA256 baseline retained in ignored backup.
