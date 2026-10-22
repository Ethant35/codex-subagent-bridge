# Local acceptance record

Author: Ethan. Verification date: 2026-10-22. Core v1.0: **PASS, CB-01 through CB-18**. Live Claude remains pending.

GitHub Actions is intentionally omitted and disabled at repository level per Ethan. All evidence here is local. No CI pass is claimed. The core gate and final packaging checks pass; the authorized main merge and v1.0.0 release can proceed.

## Environment and evidence

macOS arm64; Node 22.13.1; npm 10.9.2; native Codex CLI 0.163.0. Official Claude Agent SDK 0.3.308. No standalone Claude CLI or Claude account is available. Authorized OpenRouter access was supplied transiently to test processes. Real inference used deepseek/deepseek-v4.1-flash-1017. Native Codex gpt-6-luna used the existing ChatGPT login and a process-scoped MCP tool approval. No global configuration was changed. Claude credential variables remain absent.

Final local suite: **73 scenarios: 51 passed, 22 external skips, 0 failed** (`CPB_NETWORK_E2E=1 npm test`, `evidence/final-local.tap`). Separate paid runs passed all seven OpenRouter/native-parent scenarios: CB-04, 05, 06, 07, 09, 10, and 11. See `evidence/live-first.tap`, `live-remaining.tap`, and `live-repaired.tap`; the intermediate failures are retained. The initial parent test lacked unattended tool approval. The initial unique-instruction test contradicted its instruction with a stale expected-output field. Both test configurations were corrected, then only those two scenarios were rerun successfully. No provider response was fabricated or mocked.

The timeout check expires before provider submission. Cancellation was verified after a real provider response and local tool execution, during the second request; its terminal state is CANCELLED. This does not certify that remote billing immediately stops. Sanitized actual run records, provider generation IDs, response usage/cost, events, and successful native-parent output are retained under `evidence/live/`.

Reproducible checks: `npm ci`, `npm run check`, `npm test`, `npm audit --omit=dev`, `npm pack`, clean archive installation, CLI help/doctor, and clean-checkout E2E. Evidence files under `evidence/` contain the final local run and packaging outcome. Clean checkout at `68c76b2` passed npm ci, TypeScript checks, and the full default E2E suite (50 passed, 23 explicit skips, zero failures); `evidence/release-clean-install.txt` records the exact commit and commands. The network-enabled suite separately passed its real invalid-key failure case. The packaged 1.0.0 CLI passed version/help/doctor and a live file-read test. No provider response is mocked. Process-control tests run real operating-system processes, not fake Claude binaries or invented Claude result JSON.

## Scenario matrix

| ID | Scenario | Status | Evidence / remaining condition |
| --- | --- | --- | --- |
| CB-01 | Clean installation, help, doctor | PASS | Clean local checkout and packed archive checks; production CLI |
| CB-02 | Missing credentials | PASS | OpenRouter BLOCKED; both Claude adapters report missing key; source unchanged |
| CB-03 | Task integrity | PASS | Malformed/missing/empty/unknown-field envelopes rejected before execution |
| CB-04 | Live OpenRouter read | PASS | Real model returned an unpredictable file nonce; source recorded |
| CB-05 | Live OpenRouter edit | PASS | Exact authorized file bytes published; both unrelated files unchanged |
| CB-06 | Native Codex to OpenRouter to parent | PASS | Actual Codex CLI called cpb_delegate and consumed its child result; run inspected COMPLETED |
| CB-07 | Unique instruction / lost task | PASS | Empty instructions rejected; exact text/hash persisted; live unique instruction marker returned |
| CB-08 | Permission denial | PASS (broker boundary) | Real production MCP reads/writes; unauthorized reads/writes/traversal, symlinks and hard links denied; logs checked. Claude runtime boundary still pending |
| CB-09 | Timeout | PASS (local) | Real supervised process terminates; production task expires before provider submission and persists TIMED_OUT. Live cancellation/remote billing not certified |
| CB-10 | Cancellation | PASS | Production cancellation during preparation, queueing, and live inference persists CANCELLED; remote billing caveat above |
| CB-11 | Concurrent delegated tasks | PASS | Two independent live results/workspaces; local third-task queue, cancel, slot reuse, and shared tool budget checked |
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

OpenRouter verified end to end. Claude SDK and CLI implemented; live Claude verification pending. Core CB-01 through CB-18 pass on the documented macOS environment. CB-19 through CB-24 remain BLOCKED_EXTERNAL and are not represented as passes. The full cross-provider feature set is not VERIFIED.

Security scope: exact file capabilities and trusted runtimes, no model-callable shell/network, private copied workspaces, two concurrent tasks per store, bounded process groups. No hostile-local-user isolation, OS firewall, or multi-file atomic publication is claimed. See SECURITY.md for full limitations.


## Capability audit and method, 2026-10-22

Field: security engineering for an agent tool broker. Following the explicitly requested be-ambitious skill, the expert standard was to reproduce boundary failures before fixing them, check persistence across process restarts, and test a shared budget under overlapping processes. The raw evidence was the production TypeScript source, installed MCP SDK 1.32.1 handler code, real filesystem objects, actual CLI/MCP processes, and persisted events. The methods were Node's production test runner, a named pipe created by mkfifo, an external process watchdog, parallel MCP clients, and byte-for-byte checks of untouched files. Pass means prompt rejection of unsupported files, durable denials, no writes after failure, and at most the authorized number of operations across processes.

Rewritten prompt executed:

```text
Audit and harden Codex Subagent Bridge's existing file-capability boundary.
Start from the current source, pinned MCP SDK implementation, official Node
and MCP documentation, and actual acceptance evidence.

Use production CLI/MCP E2E tests to reproduce special-file hangs, validation
errors that escape audit logging, and tool-budget bypasses across restarted
or overlapping tool-server processes. Use real files and processes, with
no mocked model responses or fabricated successful runs.

Fix demonstrated defects in the existing boundary. Require prompt rejection
of unsupported files, durable records for every denied tool call, persistent
failure state, and one enforced tool-step budget per task. Verify that valid
authorized file operations still work and unauthorized files stay unchanged.

Record before/after evidence and precise limitations in ACCEPTANCE.md and
HANDOFF.md, then update the existing PR. Add no features or providers. Keep
GitHub Actions disabled, monitor usage, and preserve the live-provider release
blockers. Do not equate broker verification with live Claude verification.
```

All six original adversarial reproductions failed before the fix (`evidence/capability-before.tap`) and passed afterward (`evidence/capability-after.tap`). Three additional scenarios test twelve overlapping calls against a two-step limit and reject FIFO/hard-link write targets. The full local suite passed 51 of 73 scenarios, with 22 external skips and no failures (`evidence/capability-full-suite.tap`).

The broker now rejects unsupported files before opening them, opens with O_NONBLOCK/O_NOFOLLOW, validates the open descriptor before reading or truncating, and bounds read allocation. A per-task SQLite ledger commits each step reservation before its file operation and serializes operations across server processes. Failure remains persistent; a dead operation owner makes later work fail closed. PID reuse may conservatively hold a lease until the task deadline, never grant extra operations. Durable allowed/denied audit records use fsync. Calls reaching the tools/call handler are audited before argument validation; malformed protocol frames rejected by the SDK remain protocol errors outside this audit hook. Abrupt host termination can prevent the final event write, but the committed reservation prevents silent retry of an unfinished operation. Hostile local path races and filesystem/device stalls remain outside the trusted-local-user boundary.

Primary sources: [Node 22 file flags and file types](https://nodejs.org/download/release/v22.13.1/docs/api/fs.html), [MCP tool errors and access controls](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), and [MCP cancellation semantics](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation). Installed SDK 1.32.1 source was inspected directly: its high-level McpServer validates arguments before invoking the registered handler. The file subserver now uses the official low-level Server so policy validation and denial recording share one entry point.


## Live cost and final artifact

Ten actual OpenRouter task records (including the failed instruction fixture, cancellation, and timeout) report **USD 0.001284948** across received responses. One cancelled in-flight request may have additional unreported cost; this is not a reconciled account bill. Each task had a USD 0.02 cap. The two native Codex parent attempts used gpt-6-luna with ChatGPT authentication; the repaired attempt passed. Subscription usage is separate from OpenRouter's reported cost. See `evidence/live-summary.json`.

The installed 1.0.0 npm archive passed help, version, doctor, and an actual live file-read test (`evidence/live-packed.tap`). That final smoke check also exercises the completed-task ledger guard: failed or unfinished broker work cannot be certified complete merely because a model returns prose. The package author is Ethan; Git commits use Ethan. JSON/TAP text evidence has no standard personal-author metadata field; provenance is recorded here and in the summary. Factual Node/npm tool metadata is unchanged.
