# Release 1.2.1 qualification

Author: Ethan. Review date: 2026-10-27 (America/Los_Angeles).

This release targets one trusted local user on macOS arm64 with Node 22.13.1, using OpenRouter through the CLI or optional native Codex MCP. It improves the existing workflow: readable doctor output, credential-first setup, specific missing-input errors, and setup commands that do not load SQLite. It adds no provider or GUI. Claude backends remain experimental.

## Local and installed-package evidence

Type checking and the full suite passed: 139 local passes, 23 explicit external-provider skips, zero failures. Eleven installed CLI checks passed, including JSON compatibility, readable diagnostics, task replay, missing-file guidance, preview without writes, and refusal without spending consent. All 48 installed runtime files matched the tested build. The verification entry point is the repository-local explicit-only `.agents/verify-codex-subagent-bridge/SKILL.md`; no global skill, hook, or settings change is required.

The operations drill installed the downloaded public v1.2.0 archive and the candidate v1.2.1 archive. It checked persistent history across separate processes, a complete stopped-store backup, visible corruption, full restoration, rollback inspection, and uninstall/reinstall while retaining the store, task/source files, and synthetic `.codex/config.toml`. All seven steps passed; the CLI fetch guard observed zero attempts. These synthetic blocked records test storage and recovery, not provider success. Initial harness setup used macOS's noncanonical `/var` alias; resolving the temporary root fixed that harness error. Failed evidence was retained.

The first verification attempt lacked build dependencies; the second passed all tests but lacked npm registry metadata for an offline package install. Restoring dependencies from the existing lock and populating the package cache allowed the complete third procedure to pass. No failed assertion or test was skipped to obtain this result.

## Security, privacy, and review

The shared private-file helper preserves the prior store's bounded reads, link/FIFO checks, private permissions, atomic rename and directory synchronization. Public store exports remain compatible. Deferred imports retain the MCP cancellation signal and storage-backed lifecycle. Independent review found a remaining credential-first gap in `cpb_prepare`; it was fixed and exercised with missing and synthetic-present keys through real MCP calls.

All eight approved Semgrep Community scan groups ran with metrics disabled. Six were complete; elttam and Apiiro were partial because upstream rules failed to parse, including one JavaScript obfuscation-conditions rule. Nine heuristic findings were reviewed: path-redaction method chaining, regular expressions, dense CLI declarations, and test/reporting code. No release-blocking defect was identified. This is not complete rule coverage or cross-file analysis. Raw output is retained locally; [triage](../../evidence/production-1.2.1/static-review.json) records the limits. The production dependency audit reported zero vulnerabilities; dependencies and license notices retain the established scope.

The floor guard is not reported as clean. Against the previous HEAD it flags two modified lines in `tests/guided.test.mjs`: the obsolete paid-next-step assertion was replaced with credential-first expectations and a positive control for present credentials; the existing MCP preparation test retained every assertion and added missing-credential guidance checks. Its line-based removal heuristic treats that strengthened line as a removal. Against v1.0.0 the historical tool-list expectation includes `cpb_prepare`. No tests, external opt-in conditions, security checks, or constraint requirements were weakened.

## Live and public release checks

Prepublication live evidence is recorded in [qualification.json](../../evidence/production-1.2.1/qualification.json). Final archive and public-download records are maintained separately in root `RELEASE_ARTIFACT.json` and `PUBLICATION_VERIFICATION.json`; require version1.2.1 and completed status. The archive snapshot predates the third public-download check. A first Luna High parent prepared the native task but Codex 0.164.0 refused delegation under approval policy `never`; no child request occurred. Ethan separately authorized one corrected parent run using a temporary per-tool approval. Normal interactive users must approve the MCP call separately from project trust and the task's spending consent.

## Support limits

Plain text, explicit flags, stable JSON, escaped terminal controls, and no color-only meaning support keyboard use and terminal tooling. No unfamiliar-user or assistive-technology study was performed. Other operating systems and Node versions are unqualified. Historical performance measurements remain historical; no fresh speed or service-level claim is made. Publication is atomic per file, not across a group of files. Application caps are not guaranteed provider invoice caps. A Node CLI archive is the distributed product; native-app signing and notarization do not apply.
