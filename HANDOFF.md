# Completed v1.2.0 release handoff

Author: Ethan. Updated 2026-10-22 (America/Los_Angeles).

Repository: https://github.com/Ethant35/codex-subagent-bridge
Release: https://github.com/Ethant35/codex-subagent-bridge/releases/tag/v1.2.0
Implementation PR #4 merged. Tag commit 97a4c16. Implementation commits 9e1624b and 440a3b2. Personal Git/tag/package author Ethan. Current bookkeeping branch: codex/release-1.2-verification.

## Outcome

The authorized guided CLI/MCP usability phase is complete within the supported local OpenRouter boundary. `start` creates/replays a safe example; `task` generates IDs/paths/envelopes; `connect` previews then applies project-only MCP settings with explicit trust; `run` requires a finite positive cap plus explicit spending consent and creates new execution IDs. Native Codex uses read-only `cpb_prepare` before the existing delegation tool. Existing command JSON remains stable; readable output is optional for those commands. Release installation is first in the docs. No GUI, notarization, global config edit, hook or workflow was added.

## Verification

- Clean source export used fresh npm ci, typecheck and build. Final suite:129 local passes,23 explicit external skips,0 failures. A source refinement to human recovery output was followed by a full suite repeat. Dependency audit:0 vulnerabilities.
- Three real tasks passed: installed-package first read, actual native Luna High prepare/delegate/child-result consumption, and returning use from the downloaded release archive. Each task application cap $0.02. Total reported OpenRouter cost $0.000198084; model deepseek/deepseek-v4.1-flash-1017. No remaining live test allowance in this phase. Native subscription usage is separate.
- Native trust exercised actual project config in an isolated Codex home with the same official account through a temporary auth-file symlink. One launch-only trust configuration attempt failed before inference; a second isolated attempt without account auth returned401 before any child inference. Both retained as evidence. One authenticated native Luna High parent completed. No global config edits.
- Update from downloaded v1.1.0, rollback, retained history, deliberate corrupt copied record, complete-store restore and read-only recovery passed without provider calls.
- Public release URL fresh install passed9 command checks, including refusal without spending consent. All153 installed package files match the downloaded archive. All45 runtime hashes match the live-tested consumer. Author metadata/local links/no-secret/account-path/bundled-dependency checks pass.
- Archive SHA256: ca57d622aca0c31e6dc49b0557f0b0ca4594a65ba34b76fc651992befd342437;199461bytes. RELEASE_ARTIFACT.json records prepublication binding; PUBLICATION_VERIFICATION.json records downloaded/public installation and third live result. Bookkeeping does not alter the tagged/archive runtime.
- Actions remains disabled with zero runs. Global config hash unchanged. One floor-guard assertion-change notice is reviewed in docs/readiness/usability.md: exact MCP discovery now includes the added tool; no old assertion/skip was weakened. Earlier Semgrep is historical; changed source received focused manual review and tests.

## Scope and cleanup

Qualified: single trusted local user, macOS arm64 / Node22.13.1, OpenRouter CLI/native MCP. Claude remains experimental. Other platforms and Node versions are unqualified. No unfamiliar-user study or assistive-technology test is claimed. Existing per-file publication, provider-billing and dependency-license limits remain in READINESS/OPERATIONS/THIRD_PARTY_NOTICES.

Both bounded Luna High assistants are finished and interrupted; neither spawned agents. Owned temporary source exports, consumer installs, stores and temporary Codex home/auth symlink have been removed. Selected logs/archive remain under ignored .readiness-backups/usability/qualification. The saved temporary path is provenance only and no longer exists. No API key was saved in files or argv.

The account guard checked immediately and every55seconds in functions cell2. Most recent67%used/33%remaining, account-wide. Guard stops during final shutdown; new work must establish a new active check. Goal is marked complete only after final bookkeeping/verification. No automatic continuation. Prior v1.1.0 handoff remains in ignored backup and Git history.
