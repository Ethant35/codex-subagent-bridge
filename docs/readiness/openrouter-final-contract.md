# Frozen OpenRouter completion contract

Author: Ethan. Frozen 2026-10-29, before the newly authorized live run.

Scope: a developer on macOS arm64 / Node 22.13.1 installs public v1.3.1, connects native Codex, delegates an explicitly bounded OpenRouter task, reviews and applies or discards edits, inspects history, cancels work, and recovers safely. No feature expansion or new release is required unless a demonstrated blocker needs repair. This checklist is derived from CONSTRAINTS.md, ACCEPTANCE.md CB-01–18, the review workflow, and the existing v1.3.1 qualification. It does not waive a core requirement.

| ID | Required behavior | Evidence or remaining check |
| --- | --- | --- |
| OR-01 | Public package installs outside source and reports the correct version | Reuse v1.3.1 public verification: 190 files matched, 94 installed regressions; independently hash the package installed for the live journey |
| OR-02 | Offline setup/diagnostics expose permissions and credential/spend prerequisites; connection preserves global settings | Reuse installed setup/preview/refusal tests; verify actual project connection and unchanged global config in the live journey |
| OR-03 | Task bounds, IDs, exact instructions, private store, and file capability checks hold | Reuse 170 source passes, installed regression/permission tests and Terra confinement checks; verify live envelope, modes and unchanged unauthorized files |
| OR-04 | Native Codex prepares/delegates and uses the actual child result | Remaining: one approved Luna High parent using the public package, one bounded DeepSeek task, no retries |
| OR-05 | Successful live edit stays staged until review; reviewed bytes match the proposal | Remaining: observe AWAITING_REVIEW and unchanged source, compare full review contents and hashes |
| OR-06 | Apply refuses a changed source and then publishes reviewed bytes with valid consent | Remaining: edit disposable source, assert WRITE_CONFLICT and preserved bytes; restore the original, apply the valid review token, verify exact resulting bytes |
| OR-07 | Discard leaves source unchanged and proposals remain distinct from published paths | Reuse Terra installed retest and public review regressions, including changed and empty proposals |
| OR-08 | New processes inspect history/results and preserve state and cost | Reuse public persistence tests; inspect live pending/completed records with separate CLI processes |
| OR-09 | Cancellation ends owned work, records CANCELLED and does not publish staged changes | Reuse unchanged cancellation code, historical live cancellation and Terra active synthetic cancellation; check change impact against public source before relying on them |
| OR-10 | Interrupted writes/corrupt state have honest recovery and complete backup/restore | Reuse public storage/review regressions and seven installed operations checks; live conflict recovery must be read-only |
| OR-11 | Cost is reported from provider data or remains unknown; budget, tool and time caps hold | Remaining: reconcile actual response event costs with result usage, record request count, finite cap and tool count; no invoice/hard-ceiling claim |
| OR-12 | Claims distinguish supported OpenRouter, experimental Claude and unverified usability | Recheck current provider guidance; retain explicit Claude external gaps; label this maintainer integration evidence |

Live authorization: one public-v1.3.1 workflow, one GPT-6 Luna High subscription parent, one deepseek/deepseek-v4.1-flash-1017 task with maxSpendUsd 0.02 and at most four file-tool steps. No retries. Synthetic fact.txt/draft.txt only; staged edit, conflict refusal, local apply. Earlier budgets remain consumed. Provider settlement may exceed the application cap. Approval received directly in this chat on 2026-10-29.

No willing unfamiliar human tester is available in this session. Terra's separate technical-agent review is independent agent evidence, not a human usability study. This pass is maintainer integration evidence. Human usability remains a disclosed research gap, not an invented pass or an indefinite recruitment gate.

The goal service currently returns no existing goal. Do not invent or recreate one merely to mark it complete; record actual contract status and stop when all core requirements pass. Both usage-based stops remain disabled.

## Demonstrated blocker and bounded repair

The approved v1.3.1 Luna High parent stopped after cpb_prepare, reporting that it could not extract the task from text content. No cpb_delegate call or OpenRouter request occurred. The valid text response lacked structuredContent. v1.3.2 adds that field without changing the frozen requirements. On 2026-10-29 Ethan approved one corrected Luna High parent on the public v1.3.2 candidate, using the same unused $0.02 allocation and four-tool-step limit, with no retries. The original parent attempt remains consumed and recorded.

The separately authorized v1.3.2 Luna parent also stopped before delegation, reporting an incorrect `tools.cpb_prepare` function name. Its transcript contains no completed MCP call. Free follow-up checks confirmed that Codex enabled the configured server and that a direct client discovered both tools and received structured task data. Both Luna parent allowances are consumed; no OpenRouter request was made. A separate stronger-parent authorization was requested rather than silently retrying. Core OR-04/05/06/11 remain pending.

## Final result: PASS on public v1.3.2

On 2026-10-29 Ethan separately approved one GPT-6.1 Sol Medium parent, with explicit test-local CPB_HOME forwarding and the same unused $0.02 allocation. That one attempt passed on Codex 0.165.0. It called the exposed cpb_prepare and cpb_delegate tools once each and consumed the unpredictable child result. The two Luna failures remain recorded; this does not establish reliable Luna operation. No parent or child retry followed the Sol run.

The one DeepSeek task made three provider requests and three file-tool calls (two reads and one staged write). Received provider costs sum to **$0.00013662**, matching persisted usage. The task had a $0.02 application cap, four-step cap and 60-second runtime limit. This is response-level accounting, not an account invoice or guaranteed settlement ceiling. Subscription usage is separate.

| Contract | Final evidence |
| --- | --- |
| OR-01 | PASS: public v1.3.2 archive hash matched; all 196 installed files matched; 95 installed regressions passed |
| OR-02 | PASS: installed setup/consent checks plus actual connection preview/apply; global config bytes unchanged |
| OR-03 | PASS: 171 source passes, existing boundary checks, exact live envelope and private state modes; unrelated files unchanged |
| OR-04 | PASS: native Sol Medium prepared, delegated and consumed the real result; actual MCP calls retained |
| OR-05 | PASS: AWAITING_REVIEW, source unchanged, draft.txt proposed only, full before/after bytes and hashes checked |
| OR-06 | PASS: concurrent edit caused WRITE_CONFLICT with no publication; restoring original source allowed exact reviewed bytes to apply with the valid token |
| OR-07 | PASS, reused: public installed discard/empty-proposal tests and Terra retest; no extra paid discard task |
| OR-08 | PASS: separate CLI processes inspected pending/completed state and preserved exact cost |
| OR-09 | PASS, reused: historical real cancellation and Terra active synthetic CANCELLED evidence; runner/process/store cancellation code unchanged from v1.3.1 |
| OR-10 | PASS: public storage/review regressions, unchanged seven-step operations evidence, and live read-only conflict recovery |
| OR-11 | PASS: three actual response events reconciled to usage; three allowed file-tool steps; exact finite bounds retained |
| OR-12 | PASS: narrow OpenRouter/macOS qualification; Claude remains experimental/live-unverified; no independent human usability claim |

[Completion evidence](../../evidence/production-1.3.2/completion.json) binds the exact archive, live run and evidence reused. Sanitized parent transcripts include both failed Luna attempts and the successful Sol attempt. The test-local approval and environment forwarding qualify this native CLI configuration; they do not certify unattended delegation in every Codex UI or default approval policy. All three parent allowances and the one child-task allowance are consumed. No automatic continuation or further paid calls are authorized.
