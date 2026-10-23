# OpenRouter finite-budget pricing reproduction

Date: 2026-10-22  
Release baseline: `v1.0.0` (`8436636`)  
Author: Ethan

## Reproduced defect

With a finite task spending cap, the release implementation computed the per-request fee as `Number(model.pricing?.request || 0)`. JavaScript turns a missing or empty value into the number zero. The adapter therefore treated unknown request pricing as free, sent the inference request, and accepted a successful response whose reported cost fit within the cap.

The deterministic test `tests/providers-openrouter.test.mjs` returned a controlled model catalog with valid prompt and completion prices but no `request` field, followed by a controlled successful completion. This test did not contact OpenRouter and did not create a live provider success record.

Before the fix:

```text
$ npm run build && node --test --test-concurrency=1 tests/providers-openrouter.test.mjs
not ok finite OpenRouter budget blocks missing per-request pricing before inference
  error: Missing expected rejection.
```

The assertion expected the finite-budget task to stop before inference. Instead, the fake second response was accepted. This reproduces the defect.

## Fix and verification

Catalog prices now require non-empty string values that parse to finite, non-negative numbers. Under a finite task cap, prompt and completion rates must be known and the request rate must be explicitly known as zero. A missing, empty, invalid, non-finite, negative, or nonzero request price fails with `UNKNOWN_PRICING` before a completion request. An uncapped task does not depend on these rates for local enforcement.

After the fix:

```text
$ npm run build && node --test --test-concurrency=1 tests/providers-openrouter.test.mjs
ok finite OpenRouter budget blocks missing per-request pricing before inference
tests 1, pass 1, fail 0
```

`npm run check` also passed. The test asserts that only the model-catalog request occurred. It is a controlled fault fixture, not live OpenRouter compatibility evidence. OpenRouter’s official model catalog example includes `pricing.request` as a string, and its routing documentation describes a request-price ceiling; the conclusion that absence is unknown rather than zero is a conservative fail-closed interpretation.

## Second-pass provider contract evidence

The second pass expanded `tests/providers-openrouter.test.mjs` with controlled fetch responses. It uses only the official endpoints as URL strings and replaces `globalThis.fetch` inside each serial test; no provider request reaches the network and no test response is labeled as live compatibility evidence.

| Contract case | Observable assertion |
|---|---|
| Positive exact-instruction/read-tool path | User instruction bytes are unchanged in the request; only `read_file` executes; the next request receives the controlled tool result; final source is recorded; exactly two inference requests occur. |
| Malformed catalog row | A null model entry produces `MALFORMED_CATALOG` before inference, rather than a raw exception. |
| Malformed completion shapes | Missing choices, non-text or empty output, missing measured cost under a finite cap, and invalid tool-call JSON all fail without a false completion or unauthorized tool execution. |
| HTTP authorization/rate errors | A controlled 401 or 429 on the inference request produces the classified error and exactly one POST. |
| Uncertain charged request | A controlled connection failure after POST dispatch produces `NETWORK_ERROR`; there is no inference retry. |
| Body limits and stream failure | An oversized catalog body fails before POST; an interrupted inference body fails with `NETWORK_ERROR` and is not retried. |
| Abort | Aborting after the inference request starts rejects the pending call and does not issue another POST. |

Before the second-pass fixes, 12 of 14 focused tests passed. The two failures showed (1) a null catalog row leaked a raw `TypeError`, and (2) a stream read failure leaked the underlying stream exception. After classifying malformed model rows and response-stream failures, the focused suite passed 14/14. `npm run build` and `npm run check` also passed. These tests establish local response-handling contracts only; they do not establish OpenRouter service compatibility, real billing behavior, or provider-side cancellation.

## Superseded assumption

The resumed live catalog omitted request pricing and added structured overrides. The initial missing-request rejection described above is superseded by the repair and explicit provider-side request-price ceiling documented in `docs/readiness/provider-skills.md`. The original evidence is retained as history, not the final behavior.
