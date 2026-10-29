# Review before apply

Author: Ethan

Available in v1.3.0. Install the release as described in the README. For evaluation, set `CPB_HOME` to a new private state directory so older releases do not encounter new review records.

Create a task with explicit files:

```sh
cpb task --directory ./project --read draft.txt --write draft.txt \
  --instructions 'Correct spelling in draft.txt. Preserve its meaning.' \
  --review-before-apply --output ./task.json
cpb validate --task-file ./task.json --human
```

The task starts with a zero budget. Only after you approve the instructions, files, model, and cost, use `cpb run --task-file ./task.json --max-spend 0.02 --consent-spend`. Alternatively, add `--review-before-apply` to `run` for an existing task. It enables review for that invocation without changing the template. A stored `true` value cannot be disabled by a run flag.

The child works in a private snapshot. Successful review-mode runs return `AWAITING_REVIEW`, keep the child result, and leave project files unchanged. This is a successful provider run awaiting a local decision, so CLI exit status is zero and MCP `isError` is false. No provider request is needed for the remaining steps:

```sh
cpb review RUN_ID
cpb apply RUN_ID --review-token TOKEN_FROM_REVIEW
# Or reject the entire proposal:
cpb discard RUN_ID
```

`review` shows every changed file's complete before and after contents. Text uses JSON string notation so newlines, tabs, and terminal controls are visible. Binary contents use base64. This is private source content, not a shareable diagnostic. `--json` supplies the same exact contents and hashes for scripts. There is no partial-file selection or deletion support.

Apply checks the token, task permissions, staged hashes, original backups, and current source files. Changed staged bytes or a changed project file block apply. Resolve a conflict by discarding and preparing a new task; the bridge never silently rebases or overwrites the user's changes. An empty proposal can be applied or discarded without source writes.

Apply publishes only the authorized changes, then marks the run `COMPLETED`. Discard marks it `DISCARDED`. Both remove staged files and originals after the decision is saved. Run metadata and the child result remain private in the store. Discard does not refund inference cost.

For native Codex, pass `reviewBeforeApply: true` to `cpb_prepare`, preserve it in `cpb_delegate`, and keep the normal spending consent. Ask Codex to return the run ID. Use the CLI yourself to inspect and decide. The child file broker has no apply tool, and the parent MCP server exposes no apply/discard tool.

Automatic publication remains the default for envelopes without this option. A pre-existing version 1 task remains valid. Older v1.2.1 code cannot inspect new review envelopes/states; do not downgrade a store containing them. See [Operations](../OPERATIONS.md#pending-reviews-v130) for backups and interrupted apply recovery.

Publication is atomic per file. Disk failure or interruption can leave some files applied; the journal and original backups identify them. After an apply failure, inspect `cpb recovery RUN_ID --human`; never retry by changing the run state. The single-user trust boundary and concurrent-writer limits in [Security](../SECURITY.md#review-before-apply-v130) still apply.
