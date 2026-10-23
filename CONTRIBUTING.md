# Contributing

Author: Ethan

Use Node 22.13+ on macOS or Linux. Run `npm ci`, `npm run check`, and `npm test` from a clean checkout. Use appropriate testing layers: unit/property/contract/fault tests for deterministic behavior, and real CLI/MCP/process tests for local integration. Controlled provider responses must be labeled and never counted as live compatibility. Read CONSTRAINTS.md and run `node scripts/floor-guard.mjs --base v1.0.0`.

Run `CPB_NETWORK_E2E=1 npm test` to also check a real OpenRouter authentication failure using a deliberately invalid synthetic key. No valid provider credential or paid inference is needed for that case.

Live testing is opt-in and can incur provider charges. Supply credentials through the process environment, not command arguments or committed files. Then select the applicable flags:

```sh
CPB_LIVE_OPENROUTER=1 npm test
CPB_LIVE_OPENROUTER=1 CPB_LIVE_CODEX=1 npm test
CPB_LIVE_CLAUDE=1 CPB_CLAUDE_CREDENTIAL_MODE=api-key npm test
CPB_LIVE_CLAUDE=1 CPB_LIVE_CODEX=1 npm test
```

`CPB_OPENROUTER_MODEL`, `CPB_CLAUDE_MODEL`, and `CPB_CODEX_MODEL` select test models. Each fixture caps runtime at 120 seconds, eight tool steps, and $0.02 estimated child spend. Native Codex parent usage is separate. SDK Claude always requires an API key; CLI subscription tests need an official login and `CPB_CLAUDE_CREDENTIAL_MODE=subscription`. Use the Node test name filter to run only the relevant backend when credential modes conflict. Rate-limit reproduction must be observed on an authorized account, never induced by exhausting quota.

The suites report skipped external requirements explicitly as BLOCKED_EXTERNAL. A skipped test is not a pass. Update ACCEPTANCE.md with exact environment, commands, outcomes, source commit, and sanitized evidence. Keep native Codex-to-child-to-parent verification distinct from an MCP client transport check.

No GitHub Actions: do not add, enable, or dispatch workflows. Run equivalent applicable checks locally. Before pushing or opening PRs, verify `gh api repos/Ethant35/codex-subagent-bridge/actions/permissions` has `enabled: false`. Do not change account-wide settings or another repository.

Use feature branches, meaningful commits, and PRs. Preserve MIT notices and unrelated history. Do not force-push. Publish only when READINESS.md records passing applicable gates for the exact candidate. Keep historical live evidence distinct from fresh verification, and keep Claude experimental until its real account/runtime gates pass. Do not broaden platform or license claims beyond the evidence.
