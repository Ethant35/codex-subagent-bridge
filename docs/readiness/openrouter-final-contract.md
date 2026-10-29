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
