# Changelog

Author: Ethan

## 1.1.0

- Replace source files atomically per file; retain original bytes and a progress journal for interrupted publication. Add read-only `recovery` inspection.
- Add private sample generation, offline task validation and reduced shareable diagnostics.
- Reject corrupt/unsafe state instead of hiding records; validate scheduler schema and preserve v1.0.0 upgrade compatibility. History now defaults to 100 results and supports exclusive cursors, with a maximum of 1,000 per page. Existing all-history clients must paginate.
- Fix FIFO hangs, slot reservation, cancellation polling and final persistence/cleanup error paths.
- Reject unknown provider pricing and malformed response shapes before further inference or tool execution. Accept structured pricing overrides using conservative token rates and an explicit zero request-price routing ceiling. Charged POSTs remain unretried.
- Add controlled fault, generated pagination, real CLI/MCP, offline backup/rollback, dependency, static-analysis and performance evidence. These checks do not substitute for live provider tests.
- Qualify only the recorded macOS arm64 / Node 22.13.1 local OpenRouter use. Claude remains experimental. Linux and other Node/platform combinations are not qualified by this release.

## 1.0.0

Initial bounded CLI/MCP bridge with OpenRouter live evidence and implemented, live-unverified Claude SDK/CLI adapters. See ACCEPTANCE.md for historical evidence.
