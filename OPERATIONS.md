# Local operations

Author: Ethan

## First use

Run `cpb sample --directory ./cpb-example` in a writable parent directory. The destination must not exist. The command creates private sample files and a task with `maxSpendUsd: 0`; it makes no network request. Run `cpb validate --task-file ./cpb-example/task.json`. Validation checks the envelope, paths and snapshot bounds offline. For API-key tasks, `credentialPresent` reports only whether the expected environment variable is set. For subscription tasks it is `null`, with `credentialStatus: "unverified"` and `credentialSource: "subscription-login"`; offline validation does not inspect official CLI login. Subscription delegation is blocked in v1.3.0 pending provider approval, regardless of login status. It does not prove a provider key works, that remote pricing is available, or that a later write will succeed.

Set a finite task budget and supply the provider credential to the launching process before explicitly running `delegate`. Use a new task UUID for each submission. The sample chooses `deepseek/deepseek-v4.1-flash-1017`; availability and price can change. `cpb models --provider openrouter` fetches the current catalog without inference. `doctor` reports availability; `diagnose [RUN_ID]` emits a limited report suitable for sharing. Review any report before posting it.

`inspect` and `runs` contain private task instructions and model output, with only recognized secrets redacted. They are not shareable diagnostics. `recovery` includes relative source paths and private backup locations, so share it only with trusted support.

## History and retention

Records live in `CPB_HOME` or `~/.cpb`. Directories must be private (0700) and state files private (0600). Unsafe/corrupt records now cause explicit errors; listing no longer silently omits them. Do not fix an error by deleting evidence or making the store public.

`cpb runs` returns at most 100 runs, newest first. Use `--limit 1..1000`. For the next page, pass the last returned record's `createdAt` and `id` as `--before '{"createdAt":"...","id":"..."}'`. The cursor is exclusive. Each page scans and validates the entire store, so large histories still take O(N) time. Clients that previously assumed one call returned every run must paginate after upgrading.

There is no automatic retention deletion. COMPLETED runs remove the staging workspace and original-file backups after final persistence. Run records, events and the publication journal remain. Failed runs retain authorized file copies and original backups where preparation reached them. Disk use grows with retained runs. A snapshot is at most 8 MB; each file is at most 512,000 bytes. A child can stage at most 1,000 writable files, subject to its tool/time budget; total staged output can therefore exceed the input snapshot size in automatic mode. Review mode limits proposed output to 8 MB before accepting a proposal. Keep sufficient free disk space and archive reviewed terminal runs while all CPB processes are stopped. Preserve active or unresolved recovery runs. Never remove scheduler files to bypass concurrency limits.

## Backup, upgrade and rollback

1. Stop every CLI/MCP/Claude process using the store. Close the parent MCP connection and confirm no tasks remain active. A copied live SQLite database is not a supported backup.
2. Copy the **entire** private state directory to a private destination while stopped. Preserve modes. Include `runs/`, `scheduler.sqlite` and any journal/WAL sidecars present. Back up source files separately; a state backup is not a repository backup.
3. Test a copy with `CPB_HOME=/absolute/private/restored-store cpb runs --limit 1000`, then inspect known runs. Compare hashes of the copied files. Do not attach an untrusted store.
4. Install the new reviewed archive, or check out its tag and run `npm ci && npm run build`. Keep the previous archive/tag for rollback. There is no automatic updater or background download.
5. Inspect existing runs before submitting new work. Schema 0 is migrated additively to scheduler schema 1 on acquisition. A newer unknown schema is refused before mutation.
6. To restore, stop all users again, preserve the damaged store for diagnosis, and restore the complete backup into a different private directory. Point `CPB_HOME` there only after verification. Never merge selected database files from different snapshots.
7. Application rollback to v1.0.0 was tested for inspection of the migrated store. Use the newer tool for publication-journal recovery; v1.0.0 lacks those safeguards. To resume old execution, restore the pre-upgrade store and source snapshot. Do not assume rollback reverses source edits.

The offline source-checkout drill is `node scripts/operations-drill.mjs`. It builds from the checkout and exercises fixture records, migration, complete-store copying, corruption detection, restore, old-code inspection, and slot reuse without provider calls. The recorded drill is historical evidence for its recorded source revision; it does not qualify a later package or release. See `evidence/readiness/operations.json`.

For a released-package update, install the exact versioned archive into the same prefix used for the current installation. For the standard per-user prefix:

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.3.2/codex-subagent-bridge-1.3.2.tgz
cpb --version
cpb doctor --provider openrouter --human
```

v1.3.2 is the published release. Keep the previous archive for rollback, but do not use v1.2.1 with a store containing v1.3.0 review states or envelopes. Restore a complete, stopped-process pre-upgrade backup for that rollback; see [Update or roll back](docs/onboarding.md#update-or-roll-back). Updating the package does not migrate or delete source files. Review the current release evidence and changelog before selecting an archive.

## Interrupted publication

Each source file is replaced through a sibling temporary file and rename after its data is flushed. A failed write before rename leaves that file's original bytes intact. Existing permission bits are preserved; inode identity, ACLs and extended metadata are not promised. Parent directory flushes were tested on the recorded macOS filesystem; this is not a power-loss or hardware durability guarantee.

All source hashes are checked before publication. Do not edit the same paths concurrently. Multi-file publication is not one atomic transaction. A cancellation, full disk, process failure or host failure can leave some authorized paths updated. `publication.json` records intended hashes and per-file progress; `originals/` retains pre-task writable bytes until successful cleanup.

After the process stops, use `cpb recovery RUN_ID`. It compares actual current hashes with the journal and reports `original`, `published`, `diverged`, or `unreadable`. It never changes a source file. A crash between rename and journal update can make the recorded status lag the observed bytes. Preserve the store and current source first. Compare each file, then explicitly restore a backup only when `backupValid` is true. Preserve divergent user edits separately before any replacement. A newly created file has no original backup; decide whether to remove it after inspection. Legacy runs without a journal need manual comparison.

Storage failure may prevent the final run/error record from being written. A finalization error from the CLI/MCP is authoritative even if an older on-disk state says COMPLETED. Inspect source hashes and recovery artifacts before retrying, and use a fresh task ID. A retry can incur another charge. Local cancellation cannot guarantee that remote billing has stopped.

## Uninstall and cleanup

To remove the package from the standard per-user npm prefix:

```sh
npm uninstall --prefix "$HOME/.local/share/cpb" codex-subagent-bridge
```

This removes the package from that prefix. It does not delete the run store (`CPB_HOME` or `~/.cpb`), task files, project files, or project MCP configuration. If you added the `~/.local/share/cpb/node_modules/.bin` entry to `~/.zshrc`, remove that line separately. If you use a different npm prefix, use that same prefix with `npm uninstall`.

To disconnect a project, first back up its `.codex/config.toml`. Remove only the bridge server entry or the exact block created for the bridge, and preserve other project settings. Do not delete the whole `.codex` directory. This cleanup does not require or authorize editing the global `~/.codex/config.toml`.

Keep the run store if you may need history or recovery. Before deleting it, stop every CLI/MCP/Claude process using it and copy the full directory to a private location if you need an archive. Run history can contain task instructions, model output, and recovery data. Inspect and export anything needed before deleting the store. Uninstalling the package does not undo file changes made by completed tasks.

## Pending reviews (v1.3.0)

Use [review before apply](docs/review-before-apply.md) for the commands and recovery limits. `AWAITING_REVIEW` retains the private staged files and original backups across process restarts. `cpb cancel` only cancels active provider runs; use `cpb discard` to reject a pending proposal. Apply and discard do not invoke providers. A completed provider request can still have a cost even when its edits are discarded.

Back up the whole store while all bridge processes are stopped, including `proposal.json`, originals, and workspace. v1.2.1 cannot read the new review states or the optional envelope field. Use a separate `CPB_HOME` for v1.3.0 evaluation. Do not downgrade that store to v1.2.1; keep a stopped-process backup from before the update. New code still reads old v1.2.1 records.

If `review.lock` remains after a crash, stop bridge processes and inspect the run and publication journal. Never remove an active lock. If state is still `AWAITING_REVIEW` and no publication journal exists, a user may remove only that run's stale `review.lock` after backing up the store, then review again. `RUNNING`, `FAILED`, or an existing journal requires recovery inspection; do not reset state or force another apply. Publication is atomic per file, not across the whole task.
