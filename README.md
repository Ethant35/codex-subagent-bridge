# Codex Subagent Bridge

Author: Ethan

Codex Subagent Bridge (`cpb`) lets a native Codex parent delegate a bounded task to OpenRouter or Claude and receive the child’s actual result. It runs locally as a CLI and MCP server. It does not replace Codex’s built-in subagents.

## Install the release

The supported release path uses the published package and does not require a source checkout. Use Node.js 22.13.1 on macOS arm64 for the verified setup. Other platforms and Node versions are not yet qualified.

```sh
npm install --prefix "$HOME/.local/share/cpb" \
  https://github.com/Ethant35/codex-subagent-bridge/releases/download/v1.2.0/codex-subagent-bridge-1.2.0.tgz
export PATH="$HOME/.local/share/cpb/node_modules/.bin:$PATH"
cpb --version
cpb doctor --provider openrouter
```

The `PATH` command applies to the current shell. To make it persistent, add that line to your shell startup file. No `sudo`, global npm configuration, or source build is needed. See [Guided onboarding](docs/onboarding.md) for the first task, Codex connection, repeat use, updates, and recovery.

## Provider and spending limits

OpenRouter is verified on the qualified environment. Both Claude backends are experimental and live verification is pending. Set `OPENROUTER_API_KEY` in the environment before launching Codex so its MCP server inherits it. In zsh, `read -rs 'OPENROUTER_API_KEY?OpenRouter key: '; echo; export OPENROUTER_API_KEY` prompts without echoing the key or saving it in shell history. The key remains available to processes launched from that shell. Never put it in a task file, command argument, project config, or shared diagnostic.

The guided task starts with a zero budget. A live CLI run requires an explicit finite cap and `--consent-spend`. Each deliberate run gets new execution IDs; failed calls are not automatically retried. The application cap is a control, not a guaranteed invoice maximum: a provider may settle an in-flight request later. Use the provider’s account or key limits for a hard monetary limit. See [Providers and authentication](PROVIDERS.md).

## Advanced use

The ordinary path uses `cpb start` to create a zero-spend example, `cpb validate --human` to review it, and `cpb run` for an explicitly consented bounded run. Use `cpb task` to generate a custom task without editing JSON. For advanced workflows, call `cpb_prepare` through native Codex or create and validate a full envelope yourself. Task files contain local paths and instructions; keep them private. The MCP tool does not itself establish user spending consent: obtain explicit consent for a finite cap before setting it and calling the tool.

The legacy `delegate`, `sample`, `validate`, `doctor`, `runs`, `inspect`, and recovery commands remain available. Their JSON interface is stable; pass `--human` for readable terminal output and `--json` for machine-readable output. New guided commands use readable output by default and accept `--json` for automation.

See [Guided onboarding](docs/onboarding.md) for installation, credential setup, Codex connection, first run, repeat use, updates, and recovery. See [Operations](OPERATIONS.md) for private run records, pagination, backups, rollback, and interrupted publication. See [Readiness](READINESS.md) for the evidence and remaining platform limits. See [Security](SECURITY.md) before using the bridge with sensitive work.

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
