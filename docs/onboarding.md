# Guided onboarding

Author: Ethan

This path installs the released CLI, checks local prerequisites, creates a no-spend example, connects Codex to that project, validates the task offline, and then runs one bounded delegation after you approve its cost.

## 1. Install and check the local setup

Use Node.js 22.13.1 on macOS arm64, the environment qualified for OpenRouter. Install the release into a private per-user directory:

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.2.0/codex-subagent-bridge-1.2.0.tgz
export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"
cpb --version
cpb doctor --provider openrouter
```

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

## 3. Preview and connect the project

Review the exact project MCP configuration first:

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

Install the Codex CLI using its [official installation instructions](https://learn.chatgpt.com/docs/extend/mcp), then launch it from the shell where the key is available:

```sh
codex -C ./cpb-example
```

After connecting the project, give Codex this instruction:

> Call `cpb_prepare` for the absolute path of the current project with the task: “Read fact.txt and report the fact in one sentence.” Set `readablePaths` to [`fact.txt`] and `writablePaths` to []. Show me the prepared model, exact readable and writable paths, instructions, and zero spend cap. Ask whether I approve a $0.02 cap for this task. Wait for my explicit yes before changing the cap or calling `cpb_delegate`; if I do not approve, do not delegate. After approval, call `cpb_delegate` once and show me the actual returned result and run state. Do not retry automatically.

`cpb_prepare` returns a validated, bounded task envelope with generated identifiers and a zero spending cap. Review the envelope and the parent's summary. Only after you approve the provider, model, file access, and a finite cap should Codex change the cap and call `cpb_delegate`. The returned child result is the result to use; a failed state is not a successful delegation.

The legacy advanced route accepts a complete version 1 envelope in `cpb_delegate`. Keep its IDs, paths, provider, model, permissions, and budget accurate. Prefer `cpb_prepare` so the tool generates identifiers and validates the envelope. The parent still needs explicit finite-spend consent before any nonzero-budget call.

## Credentials and provider support

OpenRouter is verified on macOS arm64 with Node 22.13.1. Claude SDK and CLI support are experimental and live verification is pending. `doctor` and offline validation do not authenticate against a provider. See [Providers and authentication](../PROVIDERS.md) for credential modes and [Readiness](../READINESS.md) for the full qualification boundary.

## Update or roll back

To reinstall v1.2.0, use the pinned command from the README, then confirm `cpb --version` and run `cpb doctor`. To update later, substitute the exact archive URL for the reviewed release. Keep the previous archive available until the updated CLI can inspect your run store. There is no automatic updater.

The v1.1.0 rollback command is:

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.1.0/codex-subagent-bridge-1.1.0.tgz
cpb --version
```

Guided `start`, `connect`, `task`, and `run` commands are unavailable in v1.1.0. Before an upgrade or rollback, stop active bridge tasks and back up the complete private `CPB_HOME` or `~/.cpb` directory while the bridge is stopped. Follow the tested backup and compatibility steps in [Operations](../OPERATIONS.md); a CLI rollback does not undo source-file edits from a completed task.

## Source installation

For development only, clone the repository, run `npm ci`, then `npm run build`. The published package is the normal user installation path; source installation is not required for first use. See the [README](../README.md) for the commands.
