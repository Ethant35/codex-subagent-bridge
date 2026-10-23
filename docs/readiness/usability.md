# Guided CLI qualification

Author: Ethan. Date: 2026-10-22. Baseline: v1.1.0.

## Contract and review

The supported audience is a developer on macOS arm64 / Node22.13.1 with an OpenRouter account and optional native Codex. First value is an actual child result from an explicit local file. `start` prepares an offline example, `connect` previews then applies project-only MCP configuration with `--trust-project`, `task` generates a validated envelope, and `run` requires a positive finite cap plus `--consent-spend`. `run` deliberately creates fresh IDs on every invocation; it is not an idempotent retry operation. No automatic charged retry is added. `cpb_prepare` is read-only and returns a zero-budget envelope; the parent must obtain spending consent before calling existing `cpb_delegate`.

Existing commands retain default JSON and add opt-in `--human`. New commands default to text and support `--json`. Terminal control characters from paths/errors/outputs are escaped in human output. Plain text uses no color-only meaning, animation, hidden key bindings or blocking input prompts. Shell flags provide keyboard-only operation. No screen-reader or unfamiliar-user study was performed. HTML/ARIA, visual layout, browser performance and native app notarization do not apply to this CLI surface.

Project config uses the installed Node executable and CLI path. A real TOML parser validates before/after. Existing unrelated bytes remain intact with a private backup; conflicting definitions, invalid TOML, unsafe paths and user-config destinations are refused. Preview shows only the proposed block, avoiding unrelated setting disclosure. Codex project trust remains separate; no tool auto-approval is installed. Official evidence: [project configuration](https://learn.chatgpt.com/docs/config-file/config-advanced) and [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp), fetched 2026-10-22.

The MCP discovery assertion now expects the added cpb_prepare tool as well as cpb_delegate. The diff floor guard flags the changed assertion line mechanically. Manual review confirms all original validation and BLOCKED assertions remain, and discovery still requires exact equality; no skip, suppression or weakened condition was introduced. This reviewed interface addition is the only expected floor finding.

## Applied skills

Installed project-local source/license/revision records are retained in [skills.json](skills.json). No skills, hooks or global configuration were installed or changed in this phase.

| Skill | Application |
| --- | --- |
| shipping-and-launch | Release archive first, clean consumer journey, update/rollback, Actions guard, exact published hash |
| api-and-interface-design | Additive commands/tool, stable legacy JSON, explicit consent, fresh execution identity and documented non-idempotent run |
| impeccable | Context launcher once, onboarding playbook and craft floor; precise optional/replayable CLI path, no new visual surface |
| baseline-ui | One clear next command, concise success/error/empty states; CSS/React rules inapplicable |
| fixing-accessibility | Text labels, keyboard commands, non-color error states; no claimed HTML or assistive-tech audit |
| systematic-debugging | Six pre-implementation failing tests; parser/config defects traced to regex checks, repaired with focused regression |
| verification-before-completion | Current type/tests, outside-checkout installation, actual live result and publication verification required |
| OpenAI Docs | Current project-trust and stdio MCP contract verified from official docs and installed Codex CLI |

## Status

Implementation checks and release acceptance evidence are recorded in evidence/usability/qualification.json when complete. Earlier v1.1.0 performance, recovery and Semgrep artifacts remain historical evidence; no claim that the old scan covers new code. Current changed-source review covers task boundaries, spend gates, config trust/atomic replacement, output escapes and MCP cancellation compatibility.
