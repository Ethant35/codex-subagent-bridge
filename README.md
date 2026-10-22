# codex-subagent-bridge
Delegate Codex tasks to OpenRouter and Claude subagents

Codex Subagent Bridge exposes `cpb_delegate`, a local MCP tool for a native OpenAI Codex parent. It returns the actual child output, usage when available, source paths, run state, and correlation IDs. It does not replace Codex's built-in subagent provider.

**OpenRouter verified end to end. Claude SDK and CLI implemented; live Claude verification pending.** Core CB-01 through CB-18 pass. See [ACCEPTANCE.md](ACCEPTANCE.md) for exact evidence and limitations.

## Install from source

Requires Node.js 22.13+ and npm on macOS or Linux. Windows is unsupported for supervised Claude execution. Node 22 may print an experimental SQLite warning on stderr. SQLite is used locally; no server is required.

```sh
git clone https://github.com/Ethant35/codex-subagent-bridge.git
cd codex-subagent-bridge
npm ci
npm run build
node dist/cli.js --help
node dist/cli.js doctor --json
```

Use `npm link` if you want the `cpb` command on PATH. A package can also be built with `npm pack` and installed from the resulting archive. Do not put credentials in task files, shell command arguments, or Codex configuration files. Pass `OPENROUTER_API_KEY` in the launching process environment using your normal secret-management method.

## Delegate a task

Copy [examples/task.json](examples/task.json). Set `workspaceRoot` to a canonical absolute directory, list the exact files the child may read, and generate a fresh UUID for every task. Paths are relative file names, not directories or glob patterns. Instructions are passed without trimming or rewriting. The instructions' SHA-256 hash is saved with the run.

```sh
cpb delegate --provider openrouter --model openai/gpt-4.1-mini --task-file task.json --json
cpb runs --json
cpb inspect RUN_ID --json
cpb cancel RUN_ID --json
```

The example model was present in OpenRouter's tool-capable catalog on 2026-10-22; inference with it was not verified in this environment. `cpb models --provider openrouter --json` refreshes the available models. No provider or model fallback is enabled.

For edits, add `write_file` to `allowedOperations` and list `writablePaths`. Add a path to `readablePaths` separately if its existing content may be read. Changes are staged in a private copy. Successful tasks publish authorized changes after checking for source conflicts. Failed tasks retain their staging directory for recovery. Check `changedPaths`; do not infer an edit from prose alone.

`maxSpendUsd` is required: a number sets the application budget, `0` prevents inference, and `null` explicitly accepts unknown/unbounded monetary spend within the time/step bounds. Provider billing can settle after a request starts. These are execution controls, not a guaranteed invoice cap. Use provider-side key limits for a hard account budget. See [PROVIDERS.md](PROVIDERS.md).

## Connect native Codex

Codex officially supports local stdio MCP servers. Add this configuration yourself to an appropriate trusted project configuration or launch with equivalent `codex -c` overrides. The bridge installer never changes `~/.codex/config.toml`.

```toml
[mcp_servers.cpb]
command = "node"
args = ["/absolute/path/to/codex-subagent-bridge/dist/cli.js", "mcp"]
env_vars = ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"]
tool_timeout_sec = 180
```

Keep the MCP timeout greater than the task runtime. Keep the parent on its native OpenAI provider. Tell it:

> Use cpb_delegate with the full version 1 envelope from task.json, a fresh taskId, and a correlationId for this parent session. Delegate the file-reading task. Use the returned child result to write your answer. If state is not COMPLETED, report the failure instead of inventing a child result.

For explicitly authorized unattended tests, the launch-only override `-c 'mcp_servers.cpb.tools.cpb_delegate.approval_mode="approve"'` grants this tool approval for that process. Interactive use can retain normal prompts. See the [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

`cpb_delegate` accepts the envelope fields directly as its tool arguments. It returns a structured JSON run in its MCP text content and sets `isError` for unsuccessful runs. Task cancellation, including MCP request cancellation, propagates to the child. [Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Claude

Use `provider: "claude"`, `backend: "sdk"` or `"cli"`, a Claude model, and an explicit `credentialMode` in the task envelope.

```sh
cpb doctor --provider claude --json
cpb auth-status --provider claude --json
cpb delegate --provider claude --backend sdk --model MODEL --task-file task.json --json
cpb delegate --provider claude --backend cli --model MODEL --task-file task.json --json
```

SDK execution uses the official `@anthropic-ai/claude-agent-sdk` and requires `credentialMode: "api-key"` with `ANTHROPIC_API_KEY`. CLI execution requires the official installed `claude` executable, version 2.1.308 or compatible newer versions. It supports explicit API-key mode or `credentialMode: "subscription"` with an existing official `claude.ai` login. Subscription mode refuses conflicting API credentials. It does not extract tokens or offer custom OAuth. SDK subscription mode is blocked under Anthropic's documented restriction on third-party subscription authentication without prior approval. No Claude account was available for live verification.

## Commands and records

All data commands emit JSON; `--json` is accepted explicitly. `doctor` reports dependency and credential availability, not proof that a key works. Exactly two providers are supported: OpenRouter (`api`) and Claude (`sdk`, `cli`).

Records live in `~/.cpb` or a private `CPB_HOME` directory. States are `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, and `BLOCKED`. A lost owner becomes `FAILED` on inspection. Cancellation is cooperative at the bridge boundary and forceful for supervised local process groups; it cannot guarantee remote inference stops billing instantly.

Run `npm test` for local E2E. Live suites require explicit environment opt-in. No GitHub Actions workflows are provided or enabled, per the project owner's instruction. See [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [SECURITY.md](SECURITY.md).
