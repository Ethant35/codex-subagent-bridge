# Providers and authentication

Author: Ethan. Official sources checked 2026-10-28.

| Provider | Backend | Credentials | Verification |
| --- | --- | --- | --- |
| OpenRouter | api | OPENROUTER_API_KEY | v1.3.2 public-package DeepSeek review workflow passed through native Sol Medium |
| Claude | sdk | Explicit api-key mode and ANTHROPIC_API_KEY | Official SDK loads and submission configuration initializes; live pending |
| Claude | cli | Explicit api-key mode and ANTHROPIC_API_KEY | Adapter implemented; authenticated inference not verified |
| Claude | sdk or cli | Subscription | Blocked pending prior Anthropic approval |

No other provider is implemented. Alternate Claude cloud-provider routes, custom endpoints, raw OAuth token variables, and conflicting credential sources are refused. API-key mode emits a billing warning in run events and diagnostics. Subscription mode does not silently select API billing. Diagnostics disclose credential variable names and booleans, never values. They do not read OAuth storage or estimate subscription quota.

Anthropic's [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) restricts third-party products from offering claude.ai login or rate limits without prior approval. CPB has no recorded approval. Both SDK and CLI subscription delegation now return BLOCKED. This is a conservative product decision based on that guidance; calling the official CLI does not establish approval for this bridge. Existing subscription envelopes remain inspectable and locally valid, but cannot execute. No token extraction, login automation, or fallback to API billing is used.

The official [authentication guide](https://code.claude.com/docs/en/authentication) documents subscription login for Claude Code itself. That is distinct from permission to offer it through a third-party product. CPB can report the installed CLI's login status, but a logged-in result does not enable subscription delegation.

The API-key adapters use `ANTHROPIC_API_KEY`. They remain experimental: SDK import, typed configuration, process supervision, and local boundary tests are evidence of implementation, not authenticated inference. No fresh Claude request was made. Public v1.3.2 completed one authorized OpenRouter task on deepseek/deepseek-v4.1-flash-1017 through Codex 0.165.0 / GPT-6.1 Sol Medium, with test-local tool approval and CPB_HOME forwarding. Its three provider responses reported $0.00013662; this is not an invoice reconciliation. See the [completion record](docs/readiness/openrouter-final-contract.md). Claude live qualification still requires separate authorization and successful account/runtime tests.

The [CLI reference](https://code.claude.com/docs/en/cli-reference) documents restricted mode, explicit tool lists, strict MCP configuration, and authentication status. The adapter disables native tools with `--tools ""`, passes only its file broker, and retains restricted mode, bare mode, no hooks, and no automatic fallback. Required flags that an older CLI cannot accept fail closed. Managed runtime policy remains part of the trusted host configuration. Neither API-key adapter claims OS-level containment.

The official SDK dependency is pinned in package-lock.json and package.json; TypeScript compiles against its real exported types. CLI installation and login remain user-managed. The SDK installs its own separately licensed Anthropic runtime, while CLI mode uses the user-installed official executable; no terminal UI is scraped, and no proprietary Codex patch is used.

OpenRouter implements [client tool calls](https://openrouter.ai/docs/guides/features/tool-calling) through `/api/v1/chat/completions`. Models come from `/api/v1/models`. `openai/gpt-4.1-mini` was a tool-capable model in the live catalog on the verification date; it is an example, not a fixed dependency. Routing sets `allow_fallbacks: false`; no alternate model list is supplied.

Spending controls stop at zero, reject unknown pricing under a finite limit, reserve a conservative input/output amount for each OpenRouter call, constrain route prices, and check cumulative measured usage before another request or tool action. Missing cost metadata is `null`, never zero. Claude uses official maxBudgetUsd/--max-budget-usd and rejects results above the reported cap. These provider estimates are not invoices and may overshoot during an in-flight call; [Claude documents that limitation](https://code.claude.com/docs/en/cli-reference). Use [OpenRouter key/account limits](https://openrouter.ai/docs/api/reference/limits) or the provider's own billing controls for a hard monetary ceiling. No automatic API purchase or quota reset exists.

Dependency terms and the SDK bundled executable are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Availability checks do not establish authenticated inference or legal permission for a deployment model.
