# v1.3.2 verification scope

Author: Ethan. 2026-10-29.

This patch responds to a demonstrated native-parent integration failure in public v1.3.1: the parent called cpb_prepare but stopped without extracting its valid text-only task envelope. No OpenRouter inference occurred. Matching redacted structuredContent is now returned alongside the existing text JSON for preparation and delegation. This follows the [MCP structured-result specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#structured-content). The protocol repair is additive; permissions, providers, task bounds, review decisions and cancellation are unchanged.

Type checking and offline tests cover structured/text parity, secret redaction, error handling, and pending-review delegation. The exact package and public-install results are recorded after sealing in RELEASE_ARTIFACT.json, PUBLICATION_VERIFICATION.json, and evidence/production-1.3.2. The [frozen completion contract](openrouter-final-contract.md) records the live workflow and remaining gates separately. Do not infer a live pass from offline results.

No unfamiliar human tester is available. Maintainer integration and Terra technical-agent review evidence are distinct from independent human usability evidence. Claude API-key adapters remain experimental; their disclosed external gap is not a core OpenRouter gate. Current [Anthropic SDK guidance](https://code.claude.com/docs/en/agent-sdk/overview) still requires prior approval for third-party claude.ai login/rate-limit offerings. The existing conservative subscription block remains.
