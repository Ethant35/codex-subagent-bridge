# Production-readiness constraints

Author: Ethan. Baseline: v1.0.0. Reviewed: 2026-10-22.

This contract implements the supplied production-readiness requirements. No intake interview or arbitrary coverage quota is needed. No GitHub Actions, global settings, hooks, or implicit skill activation.

## Support target

Single-user, local CLI/MCP application. Qualify OpenRouter on the measured macOS arm64 / Node 22 environment. Linux and other Node versions require separate platform evidence. Windows and hostile local processes are outside the qualified boundary. Both Claude backends remain experimental until real account/runtime tests pass. No hosted service, dashboard, extra provider, or universal OS containment is implied.

## Release gates

| Dimension | Requirement | Local check |
| --- | --- | --- |
| Types | Zero TypeScript errors | npm run check |
| Correctness | All applicable deterministic tests pass; external skips identified | npm test |
| Test integrity | No weakened assertions, silent skips, removed tests, checker suppressions, or unexplained catch/stubs | node scripts/floor-guard.mjs --base v1.0.0 plus reviewed diff |
| Dependencies | No unresolved high/critical findings; licenses reviewed | npm audit --omit=dev and lockfile/license inventory |
| Security | Reproduced boundary defects fixed; no unresolved release-blocking static/manual finding | approved local Semgrep workflow, targeted tests, differential review against v1.0.0 |
| Budgets | One persistent step cap per task, bounded files (512000 bytes), snapshot (8000000 bytes), time and provider limits; no automatic charged retries | capability/provider/publication tests |
| Recovery | Disk-full writes preserve old file bytes; interrupted publication has original backups and truthful progress; corruption is visible; prior-release stores remain inspectable | publication/storage tests and actual v1.0.0 fixtures |
| Onboarding | Fresh install/help/validate/sample performs no inference until explicit delegate; failures actionable; JSON automation preserved | onboarding CLI E2E and packed-artifact checks |
| Privacy | Diagnostics omit instructions, source contents, outputs, credentials; private store ownership; no telemetry/upload by default | diagnostics/storage/redaction tests |
| Performance | Measure representative history/workspace/concurrency before optimization; report elapsed time and resource bounds; no invented service SLA | local benchmark evidence, bounded-output assertions |
| Live compatibility | Distinguish deterministic faults, local E2E, historical live evidence, and fresh live qualification | opted-in exact-model tests, run evidence |
| Release | Evidence matches claims; clean package and user docs verified; Actions remains disabled | clean checkout, npm pack/install, gh read-only permissions check |

## Floor and review

Preserve v1.0.0 positive controls and all external-provider disclosures. Existing explicitly skipped live tests remain skipped only when access/opt-in is unavailable. Every new skip requires a stated external condition. Document moved assertions and necessary cleanup catches; never silence a failure just to obtain green checks. The floor guard is adapted from the invoked skill's reference and is a shallow review aid, not a security proof. New thresholds or exemptions require a documented rationale. No new dependency is required just to satisfy a skill's example stack.
