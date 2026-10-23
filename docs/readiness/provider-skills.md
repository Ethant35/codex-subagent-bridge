# Provider readiness review: skill use

Review date: 2026-10-22  
Baseline: `v1.0.0` (`5f3a3eb`, also current `HEAD` when review began)  
Author: Ethan

This review was authorized for the OpenRouter and Claude provider adapters, the Claude SDK runner, provider tests, and the provider readiness evidence. It did not authorize live paid requests, Claude account use, dependency changes, CI, hooks, or commits. The project-local skills are explicitly invoked by the readiness assignment; the shared `.agents/README.md` confirms that installation alone is not invocation or permission.

## Actual skill-use rows

| Skill | Actual source read | Applied in this review |
|---|---|---|
| `source-driven-development` | `.agents/skills/source-driven-development/SKILL.md` | Identified the lockfile versions and checked official Claude and OpenRouter references before changing provider behavior. Recorded official URLs and the one inference about absent request pricing below. |
| `test-driven-development` | `.agents/skills/test-driven-development/SKILL.md`; shared `.agents/references/testing-patterns.md` | Added a provider-boundary test first, ran it RED against the release code, then changed the minimum pricing validation and ran it GREEN. The test uses a controlled HTTP response and makes no live request. |
| `security-and-hardening` | `.agents/skills/security-and-hardening/SKILL.md`; `.agents/skills/security-and-hardening/references/hardening-patterns.md`; shared `.agents/references/security-checklist.md` | Traced trust boundaries at task input, provider catalog/response, model tool calls, CLI/SDK processes, credential environment, and event output. Checked that provider calls are bounded, tool arguments reach the broker, raw provider errors are not returned, and credential modes fail closed. |
| `sharp-edges` | `.agents/skills/sharp-edges/SKILL.md`; `.agents/skills/sharp-edges/references/lang-javascript.md`; `.agents/skills/sharp-edges/references/auth-patterns.md` | Checked empty/missing pricing coercion, zero spend, fallback and tool defaults, cancellation behavior, credential precedence, and auth-status uncertainty. The reproduced `|| 0` pricing default was hardened. |
| `differential-review` | `.agents/skills/differential-review/SKILL.md`; `methodology.md`, `patterns.md`, `adversarial.md`, and `reporting.md` in its references | Compared the provider files to the `v1.0.0` baseline, mapped provider/auth/tool trust boundaries, checked tests and one-change blast radius, and used a bounded findings/evidence report. `HEAD` equaled the tag at review start, so there was no prior provider diff. |
| `find-bugs` | `.agents/skills/find-bugs/SKILL.md` | Read the owned provider files and relevant process, task, test, and acceptance context. Reviewed injection, authorization, auth, output handling, resource limits, error disclosure, races, and budget logic; reproduced and fixed the finite-budget pricing defect. |

The `find-bugs` skill asks for a full branch diff against the default branch, but this checkout is on `codex/production-readiness` and the requested comparison baseline is the release tag. No default-branch name was inferred. The targeted release comparison was used instead. Checklist items that do not apply to provider-only code (for example browser XSS/CSRF and password hashing) were treated as not applicable, not as passed product tests.

## Version and source verification

The project pins `@anthropic-ai/claude-agent-sdk` to `0.3.308`; the installed lockfile dependency is `0.3.308`, and its bundled Claude Code runtime manifest reports `2.1.308`. The installed SDK declaration file was inspected directly. It documents `tools: []`, `settingSources`, strict MCP configuration, SDK event types, `maxBudgetUsd`, `disableAllHooks`, and `settings.disableClaudeAiConnectors`. The installed version does not declare a `disableClaudeAiMcp` key; the supported `disableClaudeAiConnectors` setting explicitly covers Claude.ai cloud connector MCP connections. No unrecognized setting was added.

Official references checked on the review date:

- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference): `auth status` JSON and exit codes; `--tools ""`; `--bare`; `--restricted` (requires 2.1.248 or later); settings-source control; strict MCP config; output format, turns, persistence, and spend flags. Its spend documentation says estimated spend can pass the cap during an in-flight call.
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview): SDK capability/loading behavior and the policy that third-party products may not offer claude.ai login/rate limits absent prior approval. Subscription authentication remains blocked in the SDK path.
- [OpenRouter API reference](https://openrouter.ai/docs/api_reference/overview) and [client tool calling](https://openrouter.ai/docs/guides/features/tool-calling): request/response and client-side tool-loop behavior.
- [OpenRouter model catalog reference](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties): current response example includes string-valued prompt, completion, and request prices.
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection#max-price): `provider.max_price` uses dollars per million tokens and may include per-request price limits.
- [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits): provider-side account/key budgets and rate limits are separate from this client’s task budget.

The official catalog example has `pricing.request: "0"`. The documentation does not establish that a missing or empty request price means zero; treating that absence as zero is therefore not verified and could defeat a finite task budget. The implementation now blocks such catalog data before inference. This is a conservative fail-closed inference, not a claim that the official service currently emits missing request prices.

## Provider review outcome and limits

The release code routes OpenRouter calls to the fixed HTTPS API origin, disables provider fallbacks, bounds response bytes, applies request timeouts/cancellation from the parent, validates tool call structure before broker execution, and refuses missing measured cost under a finite cap. The new test closes the catalog-pricing gap described in [`provider-openrouter-budget.md`](../../evidence/readiness/provider-openrouter-budget.md).

Claude’s SDK runner uses the installed SDK in an isolated Node subprocess so the parent’s process-group supervisor can terminate it. It sends exact task instructions as the user prompt, emits only allowlisted event metadata, and fails on unsuccessful final events, permission denials, failed tool results, missing results, or unknown cost when a finite cap applies. The CLI path sends exact instructions on stdin and uses the documented no-fallback, no-session, bounded-turn/budget, strict-MCP, restricted, and built-in-tool-disabled options. The minimal child environment carries only required runtime variables and the selected API key or CLI subscription configuration directory. Subscription SDK use is blocked under the current official policy.

External readiness remains unresolved: no `claude` executable is installed or available on `PATH`, and no authorized Claude API key/account was supplied. The installed SDK can be imported and its setup can be constructed, but there was no live inference, CLI authentication, or Claude provider compatibility run. The production acceptance scenarios for Claude remain `BLOCKED_EXTERNAL`; synthetic test responses are not compatibility evidence. Managed machine policy and the trustworthiness of the operator’s executable search path are outside this code review’s verification.

No paid calls were made. No credential value was read or printed. No dependency, global config, hook, CI workflow, or Git commit was changed.

## Second-pass contract qualification

The follow-up pass reused the same six skill sources and shared security/testing references in the table above; no new skill was invoked. It reused the official OpenRouter API, model-catalog, client-tool, and routing references listed above to design controlled responses around documented request/response boundaries. The tests replace `fetch` locally, preserve the real live suite, and are explicitly contract fixtures rather than provider-compatibility claims. They verify one positive exact-instruction/read-tool flow and table-driven rejection behavior for malformed catalog/usage/output/tool-call data, HTTP 401/429, oversize and interrupted bodies, cancellation, and uncertain POST failure.

The pass found and fixed two additional fail-closed gaps: a null catalog row escaped as an unclassified TypeError, and a response-stream read failure escaped as a raw exception. Both now return generic classified provider errors. The focused controlled suite passes 14/14, with build and type check passing. Live OpenRouter/Claude compatibility status is unchanged from the limits above.

## Live catalog regression and repair

The resumed exact-artifact CB-05/06 run failed before inference because the current catalog includes structured `pricing.overrides`. The observed 468-model response also omitted `request` on every row. The earlier inference that request pricing must always be explicitly present made every finite-budget task unusable. That inference is superseded, not treated as a live-provider fault.

The official [model guide](https://openrouter.ai/docs/guides/overview/models) documents structured conditional overrides. The official [routing guide](https://openrouter.ai/docs/guides/routing/provider-selection#max-price) documents a request-price ceiling. The repair accepts the pricing object, validates selected numeric rates, takes the highest prompt/completion rate across published overrides, and sends `max_price.request: 0` on every finite-budget POST. Omission is not presented as proof that request pricing is zero; the provider constraint supplies that boundary. Explicit null, empty, invalid, negative or nonzero request prices still block. Unknown prompt/completion rates and malformed overrides block before inference. No fallback or automatic POST retry was added.

The old missing-request controlled fixture now tests a missing prompt rate, preserving its pre-inference rejection assertion. A new positive fixture checks the omitted-request route's explicit zero request ceiling, parameter enforcement and disabled fallback. Additional regressions cover conditional-rate maxima and invalid override/base pricing. Before/after evidence and a sanitized public catalog excerpt are retained. This is a correction based on actual source behavior and official documentation, not a weakened test to hide a product failure.
