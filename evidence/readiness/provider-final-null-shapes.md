# OpenRouter malformed JSON shape qualification

Author: Ethan  
Date: 2026-10-22

## Reproduced defects

Controlled fetch tests returned valid JSON `null` at the catalog and completion endpoints, plus a `null` element in a completion `tool_calls` array. Before the fix, these paths escaped as raw `TypeError`s while dereferencing `data.data`, `data.error`, and `call.id`. The focused regression run failed on all three cases (14 passed, 3 failed).

## Result after fix

The adapter now rejects a non-object catalog with `MALFORMED_CATALOG`, a non-object completion with `MALFORMED_RESPONSE`, and a malformed tool-call entry with `MALFORMED_TOOL`. The catalog shape guard also validates model identifiers, supported-parameter arrays, and pricing object values before inference. Tests verify malformed catalog data causes no inference request; malformed completion causes no tool execution and no second POST. The request body was moved to a multiline object and the response shape split into named interfaces without changing request fields.

## Verification

- `npm run check` — passed.
- `npm run build` — passed.
- `node --test --test-concurrency=1 tests/providers-openrouter.test.mjs` — 17 passed, 0 failed.
- The controlled suite retains successful exact-instruction/read-tool behavior and asserts bounded POST counts, 401/429 no-retry behavior, uncertain-request no-retry, and stream/cancellation failures.
- Tests replace `fetch` with deterministic local `Response` objects and do not contact OpenRouter or invoke paid inference. This is adapter contract evidence, not live-provider compatibility evidence.
