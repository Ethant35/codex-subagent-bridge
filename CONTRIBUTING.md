# Contributing

Author: Ethan

Use Node 22.13+ on macOS or Linux. Run `npm ci`, `npm run check`, and `npm test` from a clean checkout. Tests are E2E: real CLI commands, MCP processes, files, SDK setup, and OS process behavior. Do not add mocked LLM responses, fabricated success records, or unit tests as substitutes for provider acceptance.

Run `CPB_NETWORK_E2E=1 npm test` to also check a real OpenRouter authentication failure using a deliberately invalid synthetic key. No valid provider credential or paid inference is needed for that case.

Live testing is opt-in and can incur provider charges. Supply credentials through the process environment, not command arguments or committed files. Then select the applicable flags:

```sh
CPB_LIVE_OPENROUTER=1 npm test
CPB_LIVE_OPENROUTER=1 CPB_LIVE_CODEX=1 npm test
CPB_LIVE_CLAUDE=1 CPB_CLAUDE_CREDENTIAL_MODE=api-key npm test
CPB_LIVE_CLAUDE=1 CPB_LIVE_CODEX=1 npm test
```

`CPB_OPENROUTER_MODEL`, `CPB_CLAUDE_MODEL`, and `CPB_CODEX_MODEL` select test models. Each fixture caps runtime at 120 seconds, eight tool steps, and $0.25 estimated child spend. Native Codex parent usage is separate. SDK Claude always requires an API key; CLI subscription tests need an official login and `CPB_CLAUDE_CREDENTIAL_MODE=subscription`. Use the Node test name filter to run only the relevant backend when credential modes conflict. Rate-limit reproduction must be observed on an authorized account, never induced by exhausting quota.

The suites report skipped external requirements explicitly as BLOCKED_EXTERNAL. A skipped test is not a pass. Update ACCEPTANCE.md with exact environment, commands, outcomes, source commit, and sanitized evidence. Keep native Codex-to-child-to-parent verification distinct from an MCP client transport check.

No GitHub Actions: do not add, enable, or dispatch workflows. Run equivalent applicable checks locally. Before pushing or opening PRs, verify `gh api repos/Ethant35/codex-subagent-bridge/actions/permissions` has `enabled: false`. Do not change account-wide settings or another repository.

Use feature branches, meaningful commits, and PRs. Preserve MIT notices and unrelated history. Do not force-push. Do not merge or create v1.0.0 until CB-01 through CB-18, including all live OpenRouter and native Codex gates, pass. CB-19 through CB-24 may be externally blocked, but the release must disclose that Claude is unverified. The required core release wording after those gates pass is: "OpenRouter verified end to end. Claude SDK and CLI implemented; live Claude verification pending."
