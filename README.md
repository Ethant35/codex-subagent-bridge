# Codex Subagent Bridge

Author: Ethan

Codex Subagent Bridge (`cpb`) lets a native Codex parent delegate a bounded task to OpenRouter or Claude and receive the child’s actual result. It runs locally as a CLI and MCP server. It does not replace Codex’s built-in subagents.

## Install the release

The supported release path uses the published package and does not require a source checkout. Use Node.js 22.13.1 on macOS arm64 for the verified setup. Other platforms and Node versions are not yet qualified.

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.2.1/codex-subagent-bridge-1.2.1.tgz
export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"
cpb --version
cpb doctor --provider openrouter --human
```

The `PATH` command applies to the current shell. For zsh, add `export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"` once to `~/.zshrc`, then open a new terminal. No `sudo`, global npm configuration, or source build is needed. Direct CLI use does not require Codex to be installed. See [Guided onboarding](docs/onboarding.md) for a first task, optional Codex connection, repeat use, updates, and recovery.

## Provider and spending limits

OpenRouter CLI and native Codex MCP are verified on macOS arm64 / Node 22.13.1 for v1.2.1. See [release qualification](docs/readiness/production-1.2.1.md) for evidence and limits. Both Claude backends remain experimental and live verification is pending. Set `OPENROUTER_API_KEY` in the environment before running `cpb` or launching Codex for MCP use. In zsh, `read -rs 'OPENROUTER_API_KEY?OpenRouter key: '; echo; export OPENROUTER_API_KEY` prompts without echoing the key or saving it in shell history. The key remains available to processes launched from that shell. Never put it in a task file, command argument, project config, or shared diagnostic.

The guided task starts with a zero budget. A live CLI run requires an explicit finite cap and `--consent-spend`. Each deliberate run gets new execution IDs; failed calls are not automatically retried. The application cap is a control, not a guaranteed invoice maximum: a provider may settle an in-flight request later. Use the provider’s account or key limits for a hard monetary limit. See [Providers and authentication](PROVIDERS.md).

## Advanced use

The ordinary CLI path uses `cpb start` to create a zero-spend example, `cpb validate --human` to review it, and `cpb run` for an explicitly consented bounded run. Use `cpb task` to generate a custom task without editing JSON. Native Codex MCP connection is optional. For that path, call `cpb_prepare` through native Codex before `cpb_delegate`; the MCP tool does not establish spending consent. Obtain explicit consent for a finite cap before setting it and calling the tool.

The legacy `delegate`, `sample`, `validate`, `doctor`, `runs`, `inspect`, and recovery commands remain available. Their JSON interface is stable; pass `--human` for readable terminal output and `--json` for machine-readable output. New guided commands use readable output by default and accept `--json` for automation.

See [Guided onboarding](docs/onboarding.md) for installation, credential setup, Codex connection, first run, repeat use, updates, and recovery. See [Operations](OPERATIONS.md) for private run records, pagination, backups, rollback, and interrupted publication. See [Readiness](READINESS.md) for the evidence and remaining platform limits. See [Security](SECURITY.md) before using the bridge with sensitive work.

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
