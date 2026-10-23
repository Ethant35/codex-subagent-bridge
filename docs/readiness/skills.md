# Explicit skill-use record

Author: Ethan. Applied to the bounded 2026-10-22 production-readiness assignment.

All 26 requested skills were located in the existing shared `.agents/skills` installation and their applicable instructions were read by the primary reviewer or one of the two authorized workers. No extra skill was installed, no hook/configuration was changed, and no implicit activation was enabled. Exact upstream revisions and original hashes are in [skills.json](skills.json). Worker scope and reference-level evidence are in [provider-skills.md](provider-skills.md), [storage-skills.md](storage-skills.md), and [interface-scope.md](interface-scope.md).

| Skill | Applicability and concrete application | Verification/output |
| --- | --- | --- |
| source-driven-development | Current installed Node, SQLite, SDK types and provider interfaces checked before changes | Provider source links; pinned dependency inventory |
| constraint-driven-development | Measurable release floor established without arbitrary coverage quota or CI | CONSTRAINTS.md; adapted floor guard; nine isolated positive/negative controls |
| documentation-and-adrs | Local trusted-user support boundary and recovery decision documented | ADR 0001; OPERATIONS.md; refreshed public docs |
| test-driven-development | Reproduced pricing, publication truncation, CLI FIFO, malformed shapes and storage/lifecycle faults before repairs | Retained before/after TAP and fault evidence |
| property-based-testing | Generated tied-timestamp records and complete cursor walk assert order, bounds, uniqueness and coverage | storage.test.mjs; no new test dependency |
| systematic-debugging | Root-caused FIFO blocking, missing transactional slot INSERT and persistence errors | Storage/lifecycle regression tests; no blame on test ownership |
| variant-analysis | Checked neighboring record, JSONL, tool-ledger and task-file paths for the same unsafe-open defects | Shared private file helpers; FIFO watchdogs |
| security-and-hardening | Reviewed provider input, capability execution, private state, path publication and diagnostic boundaries | Provider/storage/publication tests and SECURITY.md |
| sharp-edges | Removed missing-price-as-zero behavior; safe zero-spend sample; bounded history and explicit error states | Provider budget contracts; onboarding tests |
| semgrep | Exact plan separately approved by Ethan; ran installed workflow, Community engine, metrics off; merged outputs and removed cloned rules | evidence/readiness/semgrep.json; compilation limits disclosed |
| differential-review | Compared actual release tag to working changes, including new files; reviewed blast radius and test gaps | Provider review and final differential-review.md |
| find-bugs | Reviewed actual call paths and malformed-data handling; reproduced null-root/null-tool errors | 30 controlled provider tests; final review |
| api-and-interface-design | Added sample/validate/diagnose/recovery commands without changing the task v1 envelope; stable errors and cursor contract | CLI help, missing-argument/invalid-cursor tests; pagination migration note |
| observability-and-instrumentation | Generic error codes, bounded event records and an allowlisted shareable diagnostic report | Privacy assertions and actual CLI output; no telemetry service |
| deprecation-and-migration | Actual released store fixture, additive schema version, explicit changed listing contract and old-code inspection drill | storage-v1.0.0 manifest; operations.json |
| performance-optimization | Measured history before/after; measured 8 MB and 1,000-file workloads and persistent MCP sequence | performance.json and storage-performance.json; slower scan and fsync costs disclosed |
| code-simplification | Limited cleanup of flagged request/diagnostic object construction and removal of unused import; no unrelated rewrite | Existing provider/onboarding tests unchanged; reviewed diff |
| shipping-and-launch | Exact candidate, install/package, dependency terms, rollback and supported-platform review | READINESS.md, THIRD_PARTY_NOTICES.md, artifact manifest |
| verification-before-completion | Fresh commands precede claims; external skips, mocked faults and historical live evidence remain distinct | Local-suite TAP, artifact/live evidence and final gate matrix |
| impeccable | CLI applicability assessed; used help/sample/validate/diagnostic onboarding guidance | Actual CLI onboarding tests; no graphical engine call |
| baseline-ui | Inapplicable: no graphical UI or component stack | Source/package inventory; no UI migration |
| fixing-accessibility | Graphical checks inapplicable; terminal text and JSON clarity checked | No ANSI control sequences, help width and automation assertions; no WCAG claim |
| web-design-guidelines | Inapplicable: no web UI files | No browser audit or web guideline fetch claimed |
| vercel-react-best-practices | Inapplicable: no React/Next dependency or components | Installed react-best-practices scope read |
| vercel-composition-patterns | Inapplicable: no component composition | Installed composition-patterns scope read |
| harness-writing | Inapplicable: no native fuzz target introduced | Bounded deterministic protocol tests used; no fuzzing claim |

The task system APIs requested by the Semgrep skill were unavailable. Its five dependency-ordered steps were tracked in the scan evidence instead; the separate approval gate was honored. The floor guard is intentionally shallow and excludes only its own exact path, where the detection patterns appear as source literals. Cleanup catches that preserve an already-reported primary storage/network fault are documented in code and manually reviewed. No test assertion was removed to make an implementation defect pass; the one pagination test error-code label was aligned to the existing stable Store error after its null/empty input reproduction.

The resumed source-driven pass checked the current public OpenRouter catalog and official model/routing documentation after live tests found a pricing-schema mismatch. Structured override support and explicit zero request-price routing were reproduced and repaired, with full source/package and two real live checks repeated. See provider-skills.md, clean-package.json, semgrep-final.json and live-summary.json for current evidence. Earlier failed tests remain historical records.
