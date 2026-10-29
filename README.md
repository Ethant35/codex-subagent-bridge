# Codex Subagent Bridge

Author: Ethan

Run bounded OpenRouter tasks from the CLI or native Codex. Claude API-key adapters are experimental; subscription delegation is blocked.

v1.3.1 fixes state-path aliases, distinguishes proposed edits from published edits, and restores the Claude support label in diagnostics. See [review workflow](docs/review-before-apply.md) and [current verification](docs/readiness/production-1.3.1.md).

## Install the release

The supported release path uses the published package and does not require a source checkout. Use Node.js 22.13.1 on macOS arm64 for the verified setup. Other platforms and Node versions are not yet qualified.

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.3.1/codex-subagent-bridge-1.3.1.tgz
export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"
cpb --version
cpb doctor --provider openrouter --human
```

The `PATH` command applies to the current shell. For zsh, add `export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"` once to `~/.zshrc`, then open a new terminal. No `sudo`, global npm configuration, or source build is needed. Direct CLI use does not require Codex to be installed. Continue with the [first task](docs/onboarding.md#first-task).

## Provider and spending limits

v1.3.1 is verified offline on macOS arm64 / Node 22.13.1, including installed CLI/MCP with synthetic responses. Live OpenRouter and native Codex evidence remains from v1.2.1. See [release qualification](docs/readiness/production-1.3.1.md) for evidence and limits. Both Claude backends remain experimental and live verification is pending. Set `OPENROUTER_API_KEY` in the environment before running `cpb` or launching Codex for MCP use. In zsh, `read -rs 'OPENROUTER_API_KEY?OpenRouter key: '; echo; export OPENROUTER_API_KEY` prompts without echoing the key or saving it in shell history. The key remains available to processes launched from that shell. Never put it in a task file, command argument, project config, or shared diagnostic.

The guided task starts with a zero budget. A live CLI run requires an explicit finite cap and `--consent-spend`. Each deliberate run gets new execution IDs; failed calls are not automatically retried. The application cap is a control, not a guaranteed invoice maximum: a provider may settle an in-flight request later. Use the provider’s account or key limits for a hard monetary limit. See [Providers and authentication](PROVIDERS.md).

## First task

```sh
cpb start --directory ./cpb-example
cpb validate --task-file ./cpb-example/task.json --human
```

These commands make no model request. `start` shows credential setup if the key is missing. Only run the paid command after reviewing the task and choosing a finite cap. Codex connection is optional; see [onboarding](docs/onboarding.md).

Add `--review-before-apply` to `task` or `run` to hold edits for review. Use `cpb review RUN_ID`, then apply with the displayed token or discard. These commands make no model requests. Automatic publication remains the default for existing envelopes.

[Operations](OPERATIONS.md) covers state, backup, recovery, and updates. [Security](SECURITY.md) defines the local permission boundary. Legacy commands keep JSON output by default; `--human` enables readable text. Guided and review commands use text by default; `--json` enables automation.

To uninstall, remove the package with `npm uninstall --prefix "$HOME/.local/share/cpb" codex-subagent-bridge`. This does not remove your `~/.cpb` run store, any `CPB_HOME` directory, project files, or project MCP configuration. See [Operations](OPERATIONS.md#uninstall-and-cleanup) before removing any of those separately.

## Install from source

For development or contribution, use the source checkout:

```sh
git clone https://github.com/Ethant35/codex-subagent-bridge.git
cd codex-subagent-bridge
npm ci
npm run build
node dist/cli.js --help
```

The project has no GitHub Actions workflows. The bridge source is MIT licensed; some dependencies have separate terms. Review [third-party notices](THIRD_PARTY_NOTICES.md) before redistribution.
