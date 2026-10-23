# Third-party components

Author: Ethan

The bridge's own source is MIT licensed. This does not relicense its dependencies. Release archives contain bridge code and documentation, not a bundled `node_modules` directory or third-party runtime executable. npm installs dependencies separately under their own terms.

The pinned `@anthropic-ai/claude-agent-sdk@0.3.308` is governed by Anthropic's terms, not the bridge's MIT license. Its platform dependency installs the separate Claude Code 2.1.308 executable (about 262 MB on the verified Darwin arm64 host). Keep its notices and review the [official SDK terms notice](https://github.com/anthropics/claude-agent-sdk-typescript) and [Claude Code legal documentation](https://code.claude.com/docs/en/legal-and-compliance) before use or redistribution. The standalone `claude` CLI remains separately user-installed. Both bridge Claude backends are experimental and live-unverified. This release does not certify a redistribution or hosted intermediary model.

The v1.1.0 locked production tree had 112 entries, of which 105 installed on this platform. Version 1.2.0 adds pinned smol-toml 1.9.1 (BSD-3-Clause) for safe project configuration parsing; its supplied notice is preserved in [licenses/smol-toml.txt](licenses/smol-toml.txt). The inventory and declared licenses are in [the dependency review](docs/readiness/dependencies.md) and [machine-readable inventory](evidence/readiness/dependencies.json). MIT, ISC, Apache, BSD and Unlicense notices supplied by npm packages remain in those packages. `standardwebhooks@1.1.1`, pulled through Anthropic's API SDK, declares MIT but omits a license text; its upstream repository root says Apache-2.0. That package-scoped discrepancy remains a review item for redistribution. No claim of complete permissive-license compatibility is made for the combined dependency tree.

The local floor guard adapts Addy Osmani's agent-skills reference at commit `aeac41d4d005999432bb7312f7ff06383a91d59d`. Its MIT notice is preserved in [licenses/addyosmani-agent-skills.txt](licenses/addyosmani-agent-skills.txt). Ethan authored the adaptations and bridge readiness documents; the upstream copyright remains unchanged.
