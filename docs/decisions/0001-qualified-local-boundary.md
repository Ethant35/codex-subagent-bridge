# ADR-001: Qualify the local OpenRouter product separately from experimental Claude

Author: Ethan. Date: 2026-10-22. Status: Accepted for this readiness effort.

## Context

v1.0.0 passed its original core gates, but it did not exercise corruption, low-disk publication, large histories, or upgrades. Provider documentation still says OpenRouter lacks credentials despite retained live evidence. Both official Claude integrations lack a live account/runtime qualification. Publishing another version would not resolve these gaps by itself.

## Decision

Qualify a single-user local CLI/MCP application for the measured macOS arm64 and Node 22 environment. Keep OpenRouter as the supported provider after fresh verification of changed workflows. Label Claude SDK/CLI experimental in commands and documentation until real compatibility tests pass. Linux is unqualified pending platform execution; Windows is unsupported. Keep local runtimes, filesystem, and account trusted. Do not invent a dashboard, hosted service, arbitrary execution tool, or extra provider.

Retain exact task instructions privately for reproducibility, but exclude them and all source/result content from shareable diagnostics. Retention remains an explicit local-user choice. Backups require a quiescent store and include private task data. Original task UUIDs remain non-retryable; an interrupted charged request is an unknown external outcome, never permission to resubmit automatically.

## Consequences and alternatives

This narrower support statement is deliberate and testable, but does not hide unresolved defects within that support boundary. Documented partial multi-file publication needs a recovery record and original bytes, not only a warning. Per-file writes will be atomic replacements; a filesystem-wide transaction is not claimed. Automatic rollback was rejected because it can overwrite edits made after interruption. Recovery inspection and explicit user-controlled restoration must detect divergent files first.

## Sources

- Node 22.13.1 fs API: https://nodejs.org/download/release/v22.13.1/docs/api/fs.html
- SQLite atomic-commit assumptions and fault testing: https://sqlite.org/atomiccommit.html
- The actual v1.0.0 tag, ACCEPTANCE.md, package-lock.json, and evidence/live/ establish historical behavior, not current readiness.
