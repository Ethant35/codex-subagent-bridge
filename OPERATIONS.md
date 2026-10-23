# Local operations

Author: Ethan

## First use

Run `cpb sample --directory ./cpb-example` in a writable parent directory. The destination must not exist. The command creates private sample files and a task with `maxSpendUsd: 0`; it makes no network request. Run `cpb validate --task-file ./cpb-example/task.json`. Validation checks the envelope, paths and snapshot bounds offline. For API-key tasks, `credentialPresent` reports only whether the expected environment variable is set. For subscription tasks it is `null`, with `credentialStatus: "unverified"` and `credentialSource: "subscription-login"`; offline validation does not inspect official CLI login. It does not prove a provider key works, that remote pricing is available, or that a later write will succeed.

Set a finite task budget and supply the provider credential to the launching process before explicitly running `delegate`. Use a new task UUID for each submission. The sample chooses `deepseek/deepseek-v4.1-flash-1017`; availability and price can change. `cpb models --provider openrouter` fetches the current catalog without inference. `doctor` reports availability; `diagnose [RUN_ID]` emits a limited report suitable for sharing. Review any report before posting it.

`inspect` and `runs` contain private task instructions and model output, with only recognized secrets redacted. They are not shareable diagnostics. `recovery` includes relative source paths and private backup locations, so share it only with trusted support.

## History and retention

Records live in `CPB_HOME` or `~/.cpb`. Directories must be private (0700) and state files private (0600). Unsafe/corrupt records now cause explicit errors; listing no longer silently omits them. Do not fix an error by deleting evidence or making the store public.

`cpb runs` returns at most 100 runs, newest first. Use `--limit 1..1000`. For the next page, pass the last returned record's `createdAt` and `id` as `--before '{"createdAt":"...","id":"..."}'`. The cursor is exclusive. Each page scans and validates the entire store, so large histories still take O(N) time. Clients that previously assumed one call returned every run must paginate after upgrading.

There is no automatic retention deletion. Successful runs remove the staging workspace and original-file backups after final persistence. Run records, events and the publication journal remain. Failed runs retain authorized file copies and original backups where preparation reached them. Disk use grows with retained runs. A snapshot is at most 8 MB; each file is at most 512,000 bytes. A child can stage at most 1,000 writable files, subject to its tool/time budget; total staged output can therefore exceed the input snapshot size. Keep sufficient free disk space and archive reviewed terminal runs while all CPB processes are stopped. Preserve active or unresolved recovery runs. Never remove scheduler files to bypass concurrency limits.

## Backup, upgrade and rollback

1. Stop every CLI/MCP/Claude process using the store. Close the parent MCP connection and confirm no tasks remain active. A copied live SQLite database is not a supported backup.
2. Copy the **entire** private state directory to a private destination while stopped. Preserve modes. Include `runs/`, `scheduler.sqlite` and any journal/WAL sidecars present. Back up source files separately; a state backup is not a repository backup.
3. Test a copy with `CPB_HOME=/absolute/private/restored-store cpb runs --limit 1000`, then inspect known runs. Compare hashes of the copied files. Do not attach an untrusted store.
4. Install the new reviewed archive, or check out its tag and run `npm ci && npm run build`. Keep the previous archive/tag for rollback. There is no automatic updater or background download.
5. Inspect existing runs before submitting new work. Schema 0 is migrated additively to scheduler schema 1 on acquisition. A newer unknown schema is refused before mutation.
6. To restore, stop all users again, preserve the damaged store for diagnosis, and restore the complete backup into a different private directory. Point `CPB_HOME` there only after verification. Never merge selected database files from different snapshots.
7. Application rollback to v1.0.0 was tested for inspection of the migrated store. Use the newer tool for publication-journal recovery; v1.0.0 lacks those safeguards. To resume old execution, restore the pre-upgrade store and source snapshot. Do not assume rollback reverses source edits.

The reproducible offline drill is `node scripts/operations-drill.mjs` from the source checkout after building. It archives the actual released tag, builds it with the identical dependency lock, creates real records, migrates, copies the complete store, detects corruption, restores, and checks old-code inspection and current slot reuse. It never calls a provider. See `evidence/readiness/operations.json`.

## Interrupted publication

Each source file is replaced through a sibling temporary file and rename after its data is flushed. A failed write before rename leaves that file's original bytes intact. Existing permission bits are preserved; inode identity, ACLs and extended metadata are not promised. Parent directory flushes were tested on the recorded macOS filesystem; this is not a power-loss or hardware durability guarantee.

All source hashes are checked before publication. Do not edit the same paths concurrently. Multi-file publication is not one atomic transaction. A cancellation, full disk, process failure or host failure can leave some authorized paths updated. `publication.json` records intended hashes and per-file progress; `originals/` retains pre-task writable bytes until successful cleanup.

After the process stops, use `cpb recovery RUN_ID`. It compares actual current hashes with the journal and reports `original`, `published`, `diverged`, or `unreadable`. It never changes a source file. A crash between rename and journal update can make the recorded status lag the observed bytes. Preserve the store and current source first. Compare each file, then explicitly restore a backup only when `backupValid` is true. Preserve divergent user edits separately before any replacement. A newly created file has no original backup; decide whether to remove it after inspection. Legacy runs without a journal need manual comparison.

Storage failure may prevent the final run/error record from being written. A finalization error from the CLI/MCP is authoritative even if an older on-disk state says COMPLETED. Inspect source hashes and recovery artifacts before retrying, and use a fresh task ID. A retry can incur another charge. Local cancellation cannot guarantee that remote billing has stopped.
