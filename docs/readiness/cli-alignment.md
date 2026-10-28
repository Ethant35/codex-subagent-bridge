# Confirmed CLI usability follow-up

Author: Ethan. Verified 2026-10-25 (America/Los_Angeles).

Ethan confirmed the bounded scope after the prior offline review: existing Codex users who can use Terminal without MCP expertise; readable diagnostics, credential-first setup, useful missing-input errors, deferred SQLite imports, and a repository-local explicit verification procedure.

## Result

`doctor --human` now prints runtime, qualification and provider status. Claude API-key presence is separate from subscription login. Keys are never printed, and presence never implies authenticated access. Default and explicit JSON doctor output remain unchanged. Human onboarding uses `--human`.

`start` and `task` now share provider-aware next-step guidance in both human and JSON output. Missing credentials lead to credential setup, doctor and validation before a paid run is suggested. Existing task replay preserves source/task bytes. The `next` string intentionally changes; its key/type and the other machine fields remain stable. Missing authorized read inputs retain `NOT_FOUND` and exit 1, identify only the validated relative path, and give a correction. Missing writable outputs remain allowed.

Setup commands avoid SQLite through command-local imports and a shared filesystem helper module. `store.ts` retains the public `atomicJSON` and `readPrivateFile` exports. The moved checks preserve private files, atomic writes, bounded reads, link/FIFO refusal and directory sync behavior. Storage-backed commands still use SQLite and may emit Node's experimental warning. No warning suppression was added.

The changes improve human guidance, retain the agent/CLI contract, and reuse the existing test suite instead of adding a parallel suite. No dependencies, constraints or global configuration were changed.

## Executed verification

The written procedure is `.agents/verify-codex-subagent-bridge/SKILL.md`, invoked by explicit file path. It does not write through the shared skills symlink. Picker discovery is not claimed.

The final procedure passed on Node 22.13.1 / macOS arm64: typecheck, build, **138 passing tests, 23 explicit external skips, zero failures**, local package installation, and 11 installed CLI checks. Installed checks include default/explicit JSON equivalence, readable doctor, setup/replay, validation, contextual failure, preview without config writes, refusal without spending consent, and empty history. Setup stderr has no SQLite warning. Exact task bytes and an edited sample survive replay; no run state is created before the refusal check. All 48 installed runtime files match the tested build. Existing tests cover local MCP framing, synthetic trust/config preservation and credential forwarding names, exact instructions/permissions, consent/caps, fresh execution IDs, synthetic result inspection, lifecycle, storage and read-only recovery.

Evidence survives scratch cleanup in `.readiness-backups/alignment-2026-10-25/verification-final/`: summary, source/test/skill hashes, logs, CLI transcripts and candidate archive. The archive snapshot has 158 files, version metadata 1.2.0 and SHA256 `33bd5ea63dee5fe7b32e87c8af0e12a10c954b5055eab7622d0474c9c145601f`. This is an unreleased local candidate, not the published 1.2.0 archive. This report was added after qualification and is not part of that archive. No release metadata or sealed public assets were replaced.

The skill validator passed using the existing local ruamel.yaml safe-parser adapter because neither available Python runtime had PyYAML. The validator code was unchanged; no dependency was installed. Script syntax and diff whitespace checks passed. `npm audit --omit=dev` reports zero vulnerabilities. GitHub Actions was read-only checked and remains disabled.

## Review and test-floor findings

Two bounded Luna High assistants implemented separate files; the lead reviewed the import graph/extraction and human/JSON behavior. A separate assistant review of guided output and the verification procedure found missing Claude API-key status and incomplete skill evidence hashes. Both were fixed before the final run. Assistants are stopped.

The floor guard is a review aid and did not return clean. Against `HEAD`, it flags the changed `tests/guided.test.mjs` start assertion: the old test expected a paid command with missing credentials, which is the defect this approved scope changes. The replacement asserts credential-first guidance and absence of a paid command, retaining offline/replay/no-overwrite checks. A separate positive control now proves that a synthetic present key still yields the explicit cap and consent flags, without leaking the key. Against `v1.0.0`, its only finding remains the historical `tests/cli.test.mjs` MCP tool-list update to include `cpb_prepare`, already reviewed for v1.2.0. No tests were deleted, external gates loosened, suppressions added or constraint exemptions changed.

## Limits

No paid/provider model call or native Codex parent inference was made. All 23 live-provider cases remain explicitly unexercised. Mock transports and synthetic blocked/completed records establish local boundaries only. Native project trust and real credential inheritance were not requalified. No new Semgrep scan, performance comparison, other-platform qualification, unfamiliar-user study or general production-readiness claim is made. The public release stays unchanged; this completed work is local and uncommitted.
