# Production dependency and license inventory

Author: Ethan  
Review date: 2026-10-22  
Input: `package-lock.json` v3 and installed production dependency tree  
Audit: `npm audit --omit=dev` — **0 vulnerabilities**

## Scope and method

This inventory excludes development dependencies. The lockfile contains 112 production package entries, including eight optional platform packages for Anthropic's Claude Agent SDK. `npm ls --omit=dev --all` resolves 105 installed entries on this macOS arm64 machine; the other seven SDK platform packages are not installed here. Package names, versions, and declared licenses come from lockfile/package metadata. I checked installed top-level `LICENSE`, `LICENCE`, `NOTICE`, `COPYING`, and `LICENSES` files for presence and nonzero size. This is a license-file presence scan, not a legal opinion or a semantic review of every license clause.

| Lockfile license declaration | Entries | Installed on this host | Review |
| --- | ---: | ---: | --- |
| MIT | 90 | 90 | Declared in package metadata. One exception, `standardwebhooks@1.1.1`, has no license text file in the installed npm package; see the review item below. |
| ISC | 7 | 7 | Declared; license files present. |
| Apache-2.0 | 2 | 2 | Declared; license files present. |
| BSD-3-Clause | 2 | 2 | Declared; license files present. |
| BSD-2-Clause | 1 | 1 | Declared; license file present. |
| Unlicense | 1 | 1 | Declared; license file present. |
| `SEE LICENSE IN README.md` | 1 | 1 | Anthropic Claude Agent SDK wrapper. Its installed `LICENSE.md` reserves all rights and refers to Anthropic legal agreements; the SDK README says Anthropic's Commercial Terms govern use. This is not an MIT/open-source license grant. |
| `SEE LICENSE IN LICENSE.md` | 8 | 1 | Eight optional Anthropic platform runtime packages are locked. The installed Darwin arm64 package has the all-rights-reserved Anthropic notice. Text in the seven platform packages not installed on this host was not verified locally. |

The full per-entry record, including installed status, declared license, platform constraints, and license-file presence, is in [`evidence/readiness/dependencies.json`](../../evidence/readiness/dependencies.json).

## Anthropic SDK and bundled runtime

The direct dependency `@anthropic-ai/claude-agent-sdk@0.3.308` resolves its bundled runtime version as Claude Code `2.1.308`. On this host its optional dependency `@anthropic-ai/claude-agent-sdk-darwin-arm64@0.3.308` installs `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`: a 262 MB Mach-O arm64 executable. Its SHA-256 is `ca923c86ac84b30574a82331a05b6e066c27477a926ceaffe46a845a33e4dd37`, matching the checksum in the SDK's installed `manifest.json`.

This binary is a separately packaged runtime with its own package metadata and `LICENSE.md`; the SDK wrapper is not a permissively licensed MIT wrapper. Both installed Anthropic license files contain an all-rights-reserved notice and direct the reader to Anthropic terms. Anthropic's [official SDK repository](https://github.com/anthropics/claude-agent-sdk-typescript) says the SDK's use is governed by its Commercial Terms, including when used to power products and services made available to customers or end users. The [Claude Code legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) says customer product integrations must meet its conditions, including keeping the binary unmodified and not reselling or intermediating usage on behalf of end users. The [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) contain the governing agreement for applicable commercial/API use.

The evidence establishes that installing the locked SDK on this platform installs the separate Anthropic executable and its terms notice. It does not establish that every intended redistribution or deployment model is permitted. Before representing the combined project as an MIT-only deliverable, maintainers should obtain a license/compliance review of the SDK and runtime terms and the product's distribution and authentication model. The project's MIT `LICENSE` does not relicense third-party components.

## Other review item

`standardwebhooks@1.1.1` declares MIT in its installed `package.json`, but the installed npm artifact includes no `LICENSE`, `NOTICE`, or `COPYING` file. Its current [upstream JavaScript package manifest](https://github.com/standard-webhooks/standard-webhooks/blob/main/libraries/javascript/package.json) also declares MIT; the repository-root [license file](https://github.com/standard-webhooks/standard-webhooks/blob/main/LICENSE) is Apache-2.0. The root license may not determine the package subdirectory's license, but the npm tarball does not include a license text to settle the question. Preserve package metadata and attribution, and resolve the package-scoped license/redistribution-text question before treating third-party notice completeness as verified.

## Audit result and limits

The recorded `npm audit --omit=dev` command returned `found 0 vulnerabilities`. This is an advisory snapshot for the installed lockfile graph; it does not certify license compatibility, source provenance, absence of malicious packages, or the safety of future resolutions. `zod` is declared as `^4.0.0` in `package.json` and resolved to `4.6.7` in this lockfile. The package's published file list excludes `package-lock.json`, so this locked inventory describes this checkout, not a guarantee that downstream installs resolve an identical transitive tree.

The report is an inventory for maintainer review, not legal advice. It records package declarations and local text presence separately so missing or restrictive terms are visible instead of being hidden under the bridge's MIT license.
