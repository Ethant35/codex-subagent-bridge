# v1.2.1 CLI and release readiness

Author: Ethan. Review date: 2026-10-27 (America/Los_Angeles).

The supported macOS arm64 / Node22.13.1 candidate passed 139 local tests with 23 explicit external skips and zero failures, eleven installed CLI checks, and seven installed-package operations checks. OpenRouter completed a synthetic read from the installed CLI and another through native Codex0.164.0 using Luna High. The native parent consumed the returned child output. Combined reported OpenRouter cost for these two checks: $0.000139548. Subscription usage is separate. Final publication records are maintained separately in PUBLICATION_VERIFICATION.json and RELEASE_ARTIFACT.json; require version1.2.1 and a completed status. This packaged evidence snapshot precedes the third public-download check.

[Production qualification](docs/readiness/production-1.2.1.md) explains the exact scope, independent review, corrected harness failures, Semgrep partial coverage, test-floor dispositions, privacy and accessibility limits. [Evidence](evidence/production-1.2.1/qualification.json) binds the tested runtime hashes. [Operations evidence](evidence/production-1.2.1/operations.json) covers update from1.2.0, restart, complete-store backup, corruption, restore, rollback and uninstall/reinstall with retained state and project configuration.

This is a single-user local CLI/MCP release. Claude remains experimental; other platforms, hostile local processes, unfamiliar-user performance and assistive technology are unqualified. The historical records below retain their original scope and dates.

---

# v1.2.0 guided CLI readiness

Author: Ethan. Review date: 2026-10-22. Baseline: v1.1.0.

The guided CLI and project MCP workflow passed 129 local tests, with 23 explicit external skips and zero failures. A clean source export used fresh npm ci, type checking, build, and a zero-finding dependency audit. The final source suite was repeated after the readable recovery refinement. The installed archive completed a real file read and native Luna High prepare/delegate/result-consumption test, each with a $0.02 application cap. Combined reported OpenRouter cost: $0.000133344. Native subscription usage is separate.

Project trust was tested in a temporary Codex home using the same authorized account; global configuration was not edited. Existing JSON interfaces are retained. The new CLI commands default to readable output with --json available. No unfamiliar-user study or assistive-technology testing is claimed. [Qualification evidence](evidence/usability/qualification.json), [update/recovery drill](evidence/usability/update-recovery.json), and [workflow/review](docs/readiness/usability.md) record exact evidence and limits. Final publication hashes and downloaded-release checks are recorded separately in RELEASE_ARTIFACT.json and PUBLICATION_VERIFICATION.json.

The supported platform and provider boundary below remains unchanged. The older performance/security figures are v1.1.0 evidence, not a fresh scan of the new code.

---

# v1.1.0 readiness

Author: Ethan. Review date: 2026-10-22. Baseline: released v1.0.0, commit `5f3a3eb62b9e0341839a5c78ecdd2eb5c1859f0e`.

Candidate qualification is for a single trusted local user on **macOS arm64 / Node 22.13.1**, using OpenRouter through the CLI or native Codex MCP integration. It does not qualify Linux, other Node/platform versions, hostile local processes, a hosted service, or either Claude backend. Claude SDK/CLI remain experimental and live-unverified.

| Requirement | Evidence | Status |
| --- | --- | --- |
| Correctness and types | Full local suite and TypeScript check; controlled fault tests distinct from external skips | PASS: 113 local tests, 23 explicit external skips; types pass |
| Publication and recovery | Original-byte preservation under disk-full fault; per-file journal; cancellation checkpoints; observed hash recovery; large valid journal | PASS locally |
| Storage and concurrency | Strict private reads/append, FIFO watchdog, corrupt records, generated stable pagination, real three-process two-slot lifecycle | PASS locally |
| Lifecycle error handling | Polling failure, final-save/event failure, non-ENOENT cleanup; slot/listener cleanup and retained recovery bytes | PASS with controlled faults |
| Onboarding and diagnostics | Actual CLI sample/validate/help/private diagnostics; invalid cursor inputs; zero-spend default | PASS locally |
| Upgrade, backup and rollback | Actual released-code fixture and complete-store copy/restore/corruption/old-code inspection drill | PASS locally; see operations.json |
| Performance and sustained local use | 500-record comparison; 8 MB/1,000-file workloads; 100 real MCP requests with no inference | Measured; limitations below |
| Static/manual security review | Approved eight-ruleset Community scan and differential review | PASS within stated scope; five script advisories reviewed; partial rules disclosed |
| Dependency and license scope | Locked inventory; audit; separate Anthropic terms and standardwebhooks text discrepancy | Reviewed with redistribution limits; no MIT-only dependency claim |
| Fresh clean install and package | Clean source export, npm ci/check/test/audit; archive consumer; package links, secrets and author check | PASS; clean-package.json and candidate-source-hashes.json |
| Live OpenRouter and native parent | Installed archive CB-05 exact edit and CB-06 native Luna parent; runtime hash binding | PASS: two fresh tasks; $0.00037277 reported total |
| Claude live SDK/CLI | No authorized Claude account/standalone CLI available | BLOCKED_EXTERNAL; experimental |
| Other platforms | No separate platform runner used | Unqualified |
| Publication controls | Actions disabled, zero runs; package and source author Ethan; archive inspected | Verified before publication; release hash recorded separately |

## Measurement limits

For 500 local records, a bounded 100-record page retained 68,248 bytes of V8 heap versus 507,448 bytes for the old 500-record result. Median warm-read time rose from 10.60 to 17.81 ms because every record is validated with stricter checks. Both scan O(N); each page scans again. This is lower retained output memory, not a speedup or peak-memory guarantee.

For 16 writable files totaling 8 MB, median preparation was 163 ms and publication 328 ms across five runs. For 1,000 tiny writable files, two-run medians were 8.24 seconds and 18.17 seconds. Per-file durable writes and repeated journal updates are deliberately costly; choose a runtime that covers preparation and publication and prefer smaller task batches. A 100-request persistent real MCP sequence completed in 3.86 seconds (median 38.93 ms, p95 42.85 ms per request) and left scheduler slots reusable. Those requests exercised missing-credential failures, not provider success or provider throughput. Sampled child RSS rose from about 73 to 81 MiB; this short run is not a long-term leak proof. One benchmark setup initially reused identical output bytes on its second iteration; alternating replacement bytes corrected the workload without changing product code.

## Boundaries that remain

Publication is atomic per file, not across files. fsync/rename tests do not prove physical power-loss durability. A storage failure can prevent final-state repair; a rejected CLI/MCP result must not be ignored because a stale record says COMPLETED. Source metadata beyond permission bits is not preserved. Interrupted tasks retain private source copies; no automatic pruning is performed. Application rollback inspection was tested, not restoration of arbitrary external source edits. The runbook explains manual recovery and stopped-process whole-store backups.

Semgrep Community provides no cross-file taint proof. The initial scan produced four dense-line readability warnings; code was expanded for review. The final scan found five local verification-script advisories: two regex-literal false positives and three readability warnings, all reviewed. Elttam and Apiiro included rules that failed to compile (including one JavaScript switch-pattern rule). These omissions remain explicit, even when other rules report no finding. Dependency audit results are advisory snapshots. The project source is MIT, but Anthropic's SDK/runtime has separate terms and a transitive license-text discrepancy remains unresolved for redistribution; release archives do not bundle those dependencies.

The exact skill-use table is [docs/readiness/skills.md](docs/readiness/skills.md). Historical core acceptance and live costs remain in [ACCEPTANCE.md](ACCEPTANCE.md); they are not a substitute for the new candidate evidence. Operator instructions are in [OPERATIONS.md](OPERATIONS.md).

## Final artifact evidence

The clean source export used fresh `npm ci`, passed type checking and 113 tests with 23 explicit external skips, and had zero dependency audit findings. After the live catalog exposed a pricing-schema defect, the repaired provider passed 30 controlled tests and the complete suite again. The installed archive then passed CB-05 and CB-06, including actual file publication and native parent consumption. The first attempt failed before inference; all evidence is retained. Two successful tasks reported a combined $0.00037277. There were two native Luna parent attempts; subscription usage is separate.

The final package is repacked only to include current documentation/evidence. Every compiled runtime file is compared with the tested consumer using the SHA-256 map in `evidence/readiness/clean-package.json`; the separate release artifact manifest records the final archive hash without a self-referential in-package hash. Package inspection verifies local Markdown links, author Ethan, no account paths/key patterns, and no bundled dependencies, scan clones or backup files. Plain-text files do not have a portable operating-system author property; the package author and authored document fields are verified.
