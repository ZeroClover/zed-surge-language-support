# Surge for Zed

A [Zed](https://zed.dev) extension for editing [Surge](https://nssurge.com) profiles, modules, and rule sets. It adds syntax highlighting and shows live errors and warnings from the command-line tool that ships with Surge for Mac.

The extension is an independent implementation modeled on Surge Networks' official VS Code extension, [Surge Language Support](https://marketplace.visualstudio.com/items?itemName=SurgeNetworks.surge-language-support). It is not an official Surge Networks product.

## Features

- **Syntax highlighting** that understands each section: policy names, rule types, regexes, module arguments, and the built-in `DIRECT` / `REJECT` policies each get their own color. Surge doesn't need to be installed for this.
- **Live diagnostics** as you type, unsaved changes included. A detached profile is checked against the main profile open alongside it, so cross-file policy references resolve. Diagnostics also refresh when an included file in the project changes on disk.
- **Outline and brackets**: the outline lists settings, proxies, and policy groups under their sections. Bracket matching and comment toggling work as you'd expect.

Diagnostics need a Surge for Mac build with LSP support. The official VS Code extension asks for 6.10.0 or later, but the build number matters too: 6.10.0 build 12400 lacks LSP, while build 12460 has it. Checks run locally and offline. They never connect to the Surge Controller or modify your Surge configuration.

## Installation

The extension isn't in Zed's extension registry yet. To install it from this repository, you need Node.js and Rust installed through [rustup](https://rustup.rs):

```sh
npm ci
npm run generate
npm run prepare:extension
```

Then run `zed: install dev extension` from Zed's command palette and pick this folder. Zed compiles the extension and the grammar itself.

To see it in action, open `Surge.conf`, `example.sgmodule`, or `example.list` from `examples/`.

## File detection

| Language | Detected automatically |
| --- | --- |
| Surge Configuration | Files named `Surge.conf`, the `.sgconf` and `.dconf` extensions, and files whose first line is `#!MANAGED-CONFIG` |
| Surge Module | The `.sgmodule` extension and files whose first line is `#!name=` |
| Surge Rule Set | The `.sgruleset` extension and files whose first line is a rule, such as `DOMAIN-SUFFIX,example.com` |

Generic extensions like `.conf` and `.list` are shared by plenty of other formats, so the extension doesn't claim them wholesale. You can mark other Surge files in one of these ways.

**Add a modeline** within the first or last five lines of the file. Surge treats it as an ordinary comment:

```
# vim: set ft=surge:
# vim: set ft=surge-module:
# vim: set ft=surge-ruleset:
```

**Match by folder** by merging this into Zed's `settings.json`. The first two patterns cover Surge's local and iCloud profile folders; replace the rule set pattern with your own path:

```json
{
  "file_types": {
    "Surge Configuration": [
      "**/Library/Application Support/Surge/Profiles/*.conf",
      "**/Library/Mobile Documents/iCloud~com~nssurge~inc/Documents/Profiles/*.conf"
    ],
    "Surge Rule Set": ["**/Surge/Rules/*.list"]
  }
}
```

You can also click the language name in Zed's status bar and pick one, though that only applies to the file that's currently open. DOMAIN-SET files use a different format from rule sets, so don't mark them as Surge Rule Set.

## Settings

By default the extension looks for the Surge CLI at `/Applications/Surge.app/Contents/Applications/surge-cli`. If Surge lives somewhere else, point to it in Zed's `settings.json`:

```json
{
  "lsp": {
    "surge": {
      "binary": {
        "path": "/Applications/Surge.app/Contents/Applications/surge-cli"
      }
    }
  }
}
```

After changing the path or updating Surge, run `editor: restart language server`.

To check policy references across files, keep the detached profile and the main profile in the same Zed project and open both. Changes to included files outside the project don't trigger a refresh; save the main profile once to re-check.

Zed opens untrusted projects in Restricted Mode, which skips diagnostics but keeps highlighting.

On Linux and Windows the language server reports that it needs macOS each time it starts. To keep just the highlighting without that error, turn the server off:

```json
{
  "languages": {
    "Surge Configuration": { "language_servers": ["!surge", "..."] },
    "Surge Module": { "language_servers": ["!surge", "..."] },
    "Surge Rule Set": { "language_servers": ["!surge", "..."] }
  }
}
```

### Hiding secrets while screen sharing

The extension marks proxy passwords, PSKs, tokens, and UUIDs, as well as `http-api`, `external-controller-access`, `ca-passphrase`, `ca-p12`, and WireGuard keys, as private values. Zed only hides them in files matched by `private_files`, and only with `redact_private_values` turned on:

```json
{
  "redact_private_values": true,
  "private_files": [
    "**/.env*", "**/*.pem", "**/*.key", "**/*.cert", "**/*.crt", "**/secrets.yml",
    "**/Surge/Profiles/*.conf"
  ]
}
```

Setting `private_files` replaces Zed's default list, so the example keeps the default entries.

## Known limitations

- Diagnostics are macOS-only.
- Surge's language server only reports diagnostics for now: there's no completion, hover, go-to-definition, or formatting.
- Detection only looks at the file name and the first line. Plain profiles that start with a comment or `[General]`, and rule sets that start with a comment, have to be marked as described above.

## Development

See [AGENTS.md](AGENTS.md) and the `docs/` folder. Common commands:

```sh
npm ci && npm run generate && npm run prepare:extension
npm test
cargo test
node scripts/test-lsp.mjs
```

## License

MIT; see [LICENSE](LICENSE). The Surge CLI is part of Surge for Mac and is neither included in nor distributed with this project.
