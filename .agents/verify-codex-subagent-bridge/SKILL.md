---
name: verify-codex-subagent-bridge
description: Verify Codex Subagent Bridge source and a locally packed CLI with retained offline evidence. Use only when explicitly requested by file path.
metadata:
  author: Ethan
---

# Verify Codex Subagent Bridge

This is an explicit file entry point inside this repository, independent of the shared `.agents/skills` symlink. Invoke by asking Codex to read this file. Picker discovery is not assumed. Do not install or copy it into a global skill directory.

Read `AGENTS.md`, `CONSTRAINTS.md`, and [the feature map](references/features.md) from the repository root. Use the current handoff to distinguish source changes from an already published release. The supported measured target is macOS arm64 / Node 22.13.1; record any different runtime without claiming equivalent qualification.

## Execute

1. From the repository root, use the existing lockfile dependencies. If absent, run `npm ci --ignore-scripts`. This downloads dependencies, not model responses. Do not change the lockfile or install tools to satisfy this procedure.
2. Run `node .agents/verify-codex-subagent-bridge/scripts/verify.mjs --output .readiness-backups/verification-RUN_ID`. Choose a new output directory for each run. The script checks types, runs the existing complete test suite, packs the built source, installs that archive into a temporary prefix from the npm cache, and exercises the installed CLI. It removes provider credentials and live opt-ins from child environments and isolates HOME, CODEX_HOME and CPB_HOME. Its only installation input is the just-created archive; it does not publish anything.
3. Read `summary.json`, `tests.log`, and `installed-cli.json` in the output directory. A zero exit alone does not qualify live or native paths. Confirm the evidence directory survives removal of the reported scratch directory. Record all external skips, failures and unexercised paths.
4. Review the diff and run `node scripts/floor-guard.mjs --base v1.0.0`. Inspect every finding. Changed expectations need a concrete behavior rationale; do not weaken tests, silence the guard or add exclusions to obtain a pass. Check `git diff --check` and `npm audit --omit=dev`; audit uses the package registry. Check Actions with the read-only repository permissions API when GitHub access is available. Keep Actions disabled.

The package smoke path uses `--version`, `doctor` in all output modes, `start` twice, `validate`, a missing-input `task`, `connect` preview, a refused `run`, and empty `runs`. It checks exit codes, expected output, no setup SQLite warning, unchanged task/sample bytes, no preview config, no premature state, and missing-credential guidance. Existing tests provide deeper MCP, permissions, consent, lifecycle and recovery checks; do not duplicate them in this script.

The install is a local candidate package, not a newly downloaded public release. For a separately authorized public-release check, download the exact released archive, record its SHA256 and compare its installed file hashes with the qualified candidate. Do not reuse a prior release's hash or label local installation as public verification.

## Maintain

Trace each mapped entry point through current source, then execute the procedure. Review changed tests and the real output before updating the map. Preserve product failures as findings until fixed; do not rewrite acceptance to hide them. Use bounded assignments only when delegation is authorized, with at most two assistants for this workflow and no nested agents. Only the lead drives a shared running surface.

No paid delegation, native Codex model request, real credential inheritance, unrelated user data, global configuration, CI, or performance claims are part of this procedure. Existing provider tests report external skips. Mock and missing-credential results prove their local boundaries only. Any future live test needs its exact provider, synthetic data and total spending cap authorized first. Stop owned work at the active account usage guard; retain completed evidence and an accurate handoff on interruption.
