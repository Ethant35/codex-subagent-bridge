# Local acceptance record

Author: Ethan. Verification date: 2026-10-22. Core v1.0: **NOT DONE**.

GitHub Actions is intentionally omitted and disabled at repository level per Ethan. All evidence here is local. No CI pass is claimed. No tag, main merge, or v1.0.0 release is authorized by the present results.

## Environment and evidence

macOS arm64; Node 22.13.1; npm 10.9.2; native Codex CLI 0.163.0. Official Claude Agent SDK 0.3.308. No standalone Claude CLI or Claude account is available. OPENROUTER_API_KEY and Claude credential variables are absent. OpenRouter's real public model catalog was queried; it lists openai/gpt-4.1-mini with tools support. No paid inference, live Claude task, or native Codex-to-live-child test was performed.

Latest local suite: **64 scenarios: 42 passed, 22 skipped as BLOCKED_EXTERNAL, 0 failed**. Command: `CPB_NETWORK_E2E=1 npm test`. The network opt-in calls the real OpenRouter service with a deliberately invalid synthetic key; it does not need or use a valid account credential. Default `npm test` skips that network case too. These counts include sub-scenarios; the CB matrix below determines release status.

Reproducible checks: `npm ci`, `npm run check`, `npm test`, `npm audit --omit=dev`, `npm pack`, clean archive installation, CLI help/doctor, and clean-checkout E2E. Evidence files under `evidence/` contain the final local run and packaging outcome. Clean checkout/archive installation passed at source commit `3f1448766212219eee0511e28f97a85c77d519f6`; later changes tighten Claude output validation, add direct cancellation checkpoints, and expand E2E coverage, with a fresh local test run recorded. No provider response is mocked. Process-control tests run real operating-system processes, not fake Claude binaries or invented Claude result JSON.

## Scenario matrix

| ID | Scenario | Status | Evidence / remaining condition |
| --- | --- | --- | --- |
| CB-01 | Clean installation, help, doctor | PASS | Clean local checkout and packed archive checks; production CLI |
| CB-02 | Missing credentials | PASS | OpenRouter BLOCKED; both Claude adapters report missing key; source unchanged |
| CB-03 | Task integrity | PASS | Malformed/missing/empty/unknown-field envelopes rejected before execution |
| CB-04 | Live OpenRouter read | BLOCKED_EXTERNAL | No OPENROUTER_API_KEY; executable live suite |
| CB-05 | Live OpenRouter edit | BLOCKED_EXTERNAL | No key; exact change and untouched-file assertions implemented |
| CB-06 | Native Codex to OpenRouter to parent | BLOCKED_EXTERNAL | MCP discovery and failure round-trip pass; actual parent/live child remains required |
| CB-07 | Unique instruction / lost task | PARTIAL | Empty instructions rejected and exact submitted text/hash persisted; live unique marker blocked |
| CB-08 | Permission denial | PASS (broker boundary) | Real production MCP reads/writes; unauthorized reads/writes/traversal, symlinks and hard links denied; logs checked. Claude runtime boundary still pending |
| CB-09 | Timeout | PASS (local) | Real supervised process terminates; production task expires before provider submission and persists TIMED_OUT. Live cancellation/remote billing not certified |
| CB-10 | Cancellation | PASS (local) | Production cpb cancel during snapshot preparation and queue waiting persists CANCELLED; real process groups terminate. Remote inference cancellation still requires live verification |
| CB-11 | Concurrent delegated tasks | PARTIAL | Two actual CLI tasks hold independent slots; a third queues, cancels, and later work acquires released slots. Independent successful provider results still require a key |
| CB-12 | Provider failure | PASS | Production CLI contacted the real OpenRouter service with an invalid synthetic key and persisted AUTH_FAILED/FAILED, no result or leaked secret |
| CB-13 | Persistent records | PASS | Separate CLI restart inspects records, lists runs, rejects duplicate IDs, refuses terminal-run cancellation |
| CB-14 | Credential redaction | PASS | Deliberately invalid synthetic secrets absent from command output/run JSON/events; conflict values not echoed |
| CB-15 | Claude availability | PASS | CLI absence reported; auth is unknown rather than falsely logged out |
| CB-16 | SDK initialization | PASS (setup only) | Real official SDK import and typed submission setup; explicitly no inference |
| CB-17 | CLI process handling | PASS (process boundary) | Nine real-process E2E scenarios cover stdout/stderr/exit, exact stdin, missing executable, overflow, timeout, cancellation, and descendants |
| CB-18 | Credential precedence | PASS | Explicit modes; API/subscription and alternate-route conflicts refused; SDK subscription blocked under official policy |
| CB-19 | Live SDK task | BLOCKED_EXTERNAL | No authorized Claude account/API key |
| CB-20 | Live CLI task | BLOCKED_EXTERNAL | No installed official CLI/account |
| CB-21 | Codex to Claude SDK | BLOCKED_EXTERNAL | No authorized Claude account/API key |
| CB-22 | Codex to Claude CLI | BLOCKED_EXTERNAL | No installed official CLI/account |
| CB-23 | Claude edits and permissions | BLOCKED_EXTERNAL | Both backends need live authorized edits and adversarial runtime boundary checks |
| CB-24 | Claude failures/cancellation/rate limit | BLOCKED_EXTERNAL | Generic process failure handling passes; actual provider behavior remains pending. Never induce quota exhaustion to manufacture a rate-limit test |

## Release decision

Local implementation is reviewable, but the required OpenRouter and native Codex gates remain externally blocked. Do not claim “OpenRouter verified end to end.” Claude is implemented through official interfaces, not live-verified. The full cross-provider feature set is not VERIFIED. Do not merge to main or publish v1.0.0 until the applicable core gates pass; preserve these disclosures if Claude live gates remain blocked afterward.

Security scope: exact file capabilities and trusted runtimes, no model-callable shell/network, private copied workspaces, two concurrent tasks per store, bounded process groups. No hostile-local-user isolation, OS firewall, or multi-file atomic publication is claimed. See SECURITY.md for full limitations.
