# Providers and authentication

Author: Ethan. Official sources checked 2026-10-22.

| Provider | Backend | Credentials | Verification |
| --- | --- | --- | --- |
| OpenRouter | api | OPENROUTER_API_KEY | Live DeepSeek read/edit and native Codex parent verified; see readiness evidence |
| Claude | sdk | Explicit api-key mode and ANTHROPIC_API_KEY | Official SDK loads and submission configuration initializes; live pending |
| Claude | cli | Explicit api-key or official subscription login | Process handling tested; official standalone CLI absent; live pending |

No other provider is implemented. Alternate Claude cloud-provider routes, custom endpoints, raw OAuth token variables, and conflicting credential sources are refused. API-key mode emits a billing warning in run events and diagnostics. Subscription mode does not silently select API billing. Diagnostics disclose credential variable names and booleans, never values. They do not read OAuth storage or estimate subscription quota.

Anthropic's [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) says third-party developers may not offer claude.ai login or rate limits without prior approval. Therefore this project's SDK subscription mode returns BLOCKED. The CLI uses only the user's official installed runtime and [documented authentication](https://code.claude.com/docs/en/authentication); subscription mode verifies `claude auth status` reports a claude.ai login. The author has no Claude account. A maintainer must review applicable terms for their deployment and complete the live gates before claiming compatibility.

[CLI programmatic mode](https://code.claude.com/docs/en/headless) documents that `--bare` does not read subscription login. API-key mode uses it; subscription mode does not. Both disable native tools with `--tools ""`, use explicit MCP servers and a noninteractive permission mode, and disable file mentions, attachments, memory, background work, hooks, and automatic connectors. [CLI reference](https://code.claude.com/docs/en/cli-reference) and [documented environment controls](https://code.claude.com/docs/en/env-vars) describe these boundaries. Administrator-managed runtime settings remain part of the trusted host configuration. Unexpected tools in runtime initialization are rejected. Old CLIs that reject required flags fail closed.

The official SDK dependency is pinned in package-lock.json and package.json; TypeScript compiles against its real exported types. CLI installation and login remain user-managed. The SDK installs its own separately licensed Anthropic runtime, while CLI mode uses the user-installed official executable; no terminal UI is scraped, and no proprietary Codex patch is used.

OpenRouter implements [client tool calls](https://openrouter.ai/docs/guides/features/tool-calling) through `/api/v1/chat/completions`. Models come from `/api/v1/models`. `openai/gpt-4.1-mini` was a tool-capable model in the live catalog on the verification date; it is an example, not a fixed dependency. Routing sets `allow_fallbacks: false`; no alternate model list is supplied.

Spending controls stop at zero, reject unknown pricing under a finite limit, reserve a conservative input/output amount for each OpenRouter call, constrain route prices, and check cumulative measured usage before another request or tool action. Missing cost metadata is `null`, never zero. Claude uses official maxBudgetUsd/--max-budget-usd and rejects results above the reported cap. These provider estimates are not invoices and may overshoot during an in-flight call; [Claude documents that limitation](https://code.claude.com/docs/en/cli-reference). Use [OpenRouter key/account limits](https://openrouter.ai/docs/api/reference/limits) or the provider's own billing controls for a hard monetary ceiling. No automatic API purchase or quota reset exists.

Dependency terms and the SDK bundled executable are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Availability checks do not establish authenticated inference or legal permission for a deployment model.
