# Guided onboarding

Author: Ethan

This path installs the CLI, checks local prerequisites, creates a no-spend example, optionally connects Codex to that project, validates the task offline, and then runs one bounded delegation after you approve its cost.

## 1. Install and check the local setup

Use Node.js 22.13.1 on macOS arm64. OpenRouter CLI and native Codex MCP were verified on this environment for v1.2.1. Install the release into a per-user directory:

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.2.1/codex-subagent-bridge-1.2.1.tgz
export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"
cpb --version
cpb doctor --provider openrouter --human
```

The `PATH` change applies to this shell. On zsh, make it persistent by adding this line once to `~/.zshrc`, then opening a new terminal:

```zsh
export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"
```

The CLI works without Codex. Install Codex only if you want to use the optional MCP connection below. No `sudo`, global npm configuration, or source build is needed.

`doctor` checks the runtime and whether the expected credential is present. It does not test the key or contact a model. If you manage the key outside Codex, this zsh prompt reads it without echoing or saving it in shell history:

```zsh
read -rs 'OPENROUTER_API_KEY?OpenRouter key: '
echo
export OPENROUTER_API_KEY
```

The key remains in this shell's environment and is inherited by processes you launch from it; this does not isolate it from those processes. Start Codex from this shell so its MCP server can read the variable. Do not put the key in a command argument, task file, or project configuration.

## 2. Create an offline example

From a directory where you want a small example project:

```sh
cpb start --directory ./cpb-example
```

This creates `fact.txt` and a valid `task.json` with spending set to zero. It checks prerequisites and credential availability without inference. If the directory already contains a valid generated task, `start` replays it without changing it. Otherwise, choose a new directory; existing files are never overwritten. The generated files stay on your machine.

## 3. Optional: connect native Codex

Direct CLI use does not require this step. To let Codex use the bridge, first install Codex using the [official Codex installation instructions](https://developers.openai.com/codex/cli). Then review the exact project MCP configuration:

```sh
cpb connect --directory ./cpb-example
```

If the displayed project path and configuration are correct, write them with explicit trust:

```sh
cpb connect --directory ./cpb-example --trust-project
```

This writes project-scoped Codex configuration only. Codex may still show its own project trust prompt when it loads the configuration. Review that prompt before accepting it. `cpb` never edits your global `~/.codex/config.toml`.

## 4. Validate the generated task

The starter task reads the sample fact and asks the child to report its contents:

```sh
cpb validate --task-file ./cpb-example/task.json --human
```

Read the displayed provider, model, cap, instructions, workspace, and allowed read/write paths before you run it. Validation is local and makes no provider request. It checks the task shape, workspace paths, size limits, and local credential availability. A present key is not proof that it works or that the provider will accept the request.

For a custom task, use `cpb task --directory ./cpb-example --read FILE --instructions '...' --output ./cpb-example/my-task.json`. Repeat `--read FILE` for every input and add `--write FILE` only for intended outputs. The command generates identifiers, sets spending to zero, and validates the envelope. Paths are explicit relative file names, not globs. Task files contain instructions and paths, so keep them private.

## 5. Run once with explicit spending consent

The run command is noninteractive. `--consent-spend` is your explicit consent to submit the task at the supplied finite cap; the command will not ask a second time. First review the complete task with `cpb validate --human`. If you accept its provider, model, files, instructions, and a $0.02 application budget, run:

```sh
cpb run \
  --task-file ./cpb-example/task.json \
  --max-spend 0.02 \
  --consent-spend
```

Without `--consent-spend`, the command refuses and makes no provider call. A zero cap also blocks inference. The application cap controls bridge requests; it cannot guarantee an invoice ceiling because a provider may settle a request after it starts. Use provider account or key limits for a hard monetary limit. No charged request is automatically retried.

The result shows the run state and generated IDs. Successful runs report the actual child output and any usage or cost the provider returned. Missing cost data stays unknown. Failed runs show an error and recovery guidance; inspect the run before trying again because a retry can incur a new charge.

## 6. Use it again

To change instructions or file access, generate a new file with `cpb task`, validate it, and run the same command with a new deliberate `--consent-spend` invocation. The CLI generates fresh execution IDs for each run. It does not silently repeat failed provider calls. Review write results and changed paths before relying on them.

For local run history and recovery, use `cpb runs`, `cpb inspect RUN_ID`, and `cpb recovery RUN_ID`. These can include private instructions, output, or local paths; do not share them as diagnostics. `cpb diagnose` is the reduced report intended for sharing, but review it first. See [Operations](../OPERATIONS.md) for backups, updates, rollback, retention, and interrupted file publication.

## Native Codex MCP use

Launch Codex from the shell where the key is available:

```sh
codex -C ./cpb-example
```

After connecting the project, give Codex this instruction:

> Call `cpb_prepare` for the absolute path of the current project with the task: “Read fact.txt and report the fact in one sentence.” Set `readablePaths` to [`fact.txt`] and `writablePaths` to []. Show me the prepared model, exact readable and writable paths, instructions, and zero spend cap. Ask whether I approve a $0.02 cap for this task. Wait for my explicit yes before changing the cap or calling `cpb_delegate`; if I do not approve, do not delegate. After approval, call `cpb_delegate` once and show me the actual returned result and run state. Do not retry automatically.

`cpb_prepare` returns a validated, bounded task envelope with generated identifiers and a zero spending cap. Review the envelope and the parent's summary. Only after you approve the provider, model, file access, and a finite cap should Codex change the cap and call `cpb_delegate`. The returned child result is the result to use; a failed state is not a successful delegation.

The legacy advanced route accepts a complete version 1 envelope in `cpb_delegate`. Keep its IDs, paths, provider, model, permissions, and budget accurate. Prefer `cpb_prepare` so the tool generates identifiers and validates the envelope. The parent still needs explicit finite-spend consent before any nonzero-budget call.

Codex also controls approval of the MCP tool call. In an interactive session, approve the exact bounded `cpb_delegate` call after reviewing it. Project trust, MCP tool approval, and provider spending consent are separate. A headless launch with approval policy `never` can refuse this tool before any provider request. Inspect the refusal; do not bypass it or assume that retrying is free. The ordinary CLI `cpb run` path remains available with its explicit cap and consent flags.

## Credentials and provider support

OpenRouter v1.2.1 is verified on macOS arm64 with Node 22.13.1. Claude SDK and CLI support remain experimental and live verification is pending. `doctor` and offline validation do not authenticate an API key against its provider. See [Providers and authentication](../PROVIDERS.md) for credential modes and [Readiness](../READINESS.md) for the full qualification boundary.

## If a command stops

- `MISSING_CREDENTIALS`: the run was blocked before a provider request because the named credential was unavailable. Make the variable available to the process that runs `cpb`, then rerun `cpb doctor --provider PROVIDER --human` and validate again. A variable being present does not prove that the provider accepts the key. Inspect the blocked run before deciding whether to submit a new run; each deliberate submission uses fresh execution IDs and may incur a charge.
- `NOT_FOUND`: check the exact relative input file and project path. Create a missing input yourself; the bridge does not guess a replacement file.
- `ALREADY_EXISTS`: `start` can replay an existing valid `task.json` without changing it. If the folder is not a valid example, choose a new directory and preserve the existing contents.
- `SPEND_CONSENT_REQUIRED`: no provider call was made. Review the task, then use a finite `--max-spend` and `--consent-spend` only if you approve that run.
- `FAILED`, `BLOCKED`, or another non-completed run: inspect the run and use read-only `cpb recovery RUN_ID --human` if source publication may have started. Check possible provider charges before a deliberate retry. See [Operations](../OPERATIONS.md#interrupted-publication).

## Update or roll back

To install v1.2.1, use the pinned command from the README, then confirm `cpb --version` and run `cpb doctor --provider openrouter --human`. The exact update command is:

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.2.1/codex-subagent-bridge-1.2.1.tgz
cpb --version
```

There is no automatic updater. Keep the prior release available until the updated CLI can inspect your run store.

To roll back to v1.2.0, install its exact archive in the same prefix:

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.2.0/codex-subagent-bridge-1.2.0.tgz
cpb --version
```

Both releases include the guided commands. Update from v1.2.0, rollback inspection, and state-preserving reinstall were checked with the installed v1.2.1 package. Before an upgrade or rollback, stop active bridge tasks and back up the complete private `CPB_HOME` or `~/.cpb` directory while the bridge is stopped. Follow the backup and compatibility steps in [Operations](../OPERATIONS.md); a CLI rollback does not undo source-file edits from a completed task.

## Uninstall and cleanup

Remove the installed npm package without deleting the state store or projects:

```sh
npm uninstall --prefix "$HOME/.local/share/cpb" codex-subagent-bridge
```

This removes the bridge package from that npm prefix. It does not remove your run store (`~/.cpb` or `CPB_HOME`), task files, project files, or project MCP configuration. If you added the PATH line to `~/.zshrc`, remove that line yourself when you no longer use this prefix.

To disconnect Codex, back up the project's `.codex/config.toml`, then edit only the `cpb` server entry or the exact marked bridge block. Preserve other project settings. Do not delete the entire `.codex` directory or edit the global `~/.codex/config.toml` for this cleanup.

Keep or remove run records separately. Before deleting a `CPB_HOME` or `~/.cpb` store, stop all bridge processes and copy the complete private store if you need an archive. Run history can contain private instructions and model output. Removing the package does not undo source-file changes from completed tasks.

## Source installation

For development only, clone the repository, run `npm ci`, then `npm run build`. The published package is the normal user installation path; source installation is not required for first use. See the [README](../README.md) for the commands.
