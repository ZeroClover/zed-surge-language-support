# Parity with the original VS Code extension

The reference is `SurgeNetworks.surge-language-support` 0.1.9 on the Marketplace (VSIX SHA-256 `97cb7921281d12a64fae0e70dc9d64a7ce0cf34b9396a0199fc741b02fe86ce6`). To look at the original extension, download the VSIX from this URL into a temporary folder; it's a zip archive:

```
https://marketplace.visualstudio.com/_apis/public/gallery/publishers/SurgeNetworks/vsextensions/surge-language-support/0.1.9/vspackage
```

The package has no source repository URL, and its JavaScript isn't minified, so it can be read directly. It's licensed all rights reserved: use it only to compare behavior, don't copy its content, and don't run its scripts.

## What the original extension contains

| File | Contents |
| --- | --- |
| `package.json` | Three language IDs, TextMate grammars, a restart command, and the `surge.languageServer.path` and `surge.autoDetect` settings; `untrustedWorkspaces` and `virtualWorkspaces` are both unsupported |
| `extension.js` | Starts `surge-cli lsp` with `vscode-languageclient`, serializes restarts, sets `maxRestartCount: 0`, and watches `**/*` for file changes |
| `compatibility.js` | Runs `help lsp` with a 3-second timeout and a 256 KiB cap, and checks that a `Usage:` line declares `--stdio` |
| `detection.js` | Detects the language from path and content |
| `syntaxes/*.tmLanguage.json` | TextMate grammars; the module grammar includes the profile grammar, and the rule set grammar includes its `#ruleset` rules |
| `language-configuration.json` | Line comment `#`; brackets `[]`, `()`, `{}`; auto-closing `[` and `"` |

Detection in the original (`detection.js`):

- `.sgmodule` files are modules. So are `.conf`, `.txt`, `.module`, and extensionless files that have `#!name=` before the first section.
- A `.conf` file is a profile if it lives in Surge's local or iCloud Profiles folder, or if it contains `[Rule]` together with `[Proxy]` or `[Proxy Group]`.
- After skipping blank lines and comments, a file is a rule set if every line is a known rule type with no third policy column, with at least two such lines (20 lines checked is enough to confirm).
- Only the first 65,536 characters are read, dropping a possibly truncated last line. Detection re-runs 250 ms after typing, and the user's file associations and manual choice take precedence.

## Feature comparison

| Original extension | This extension |
| --- | --- |
| TextMate highlighting that distinguishes meaning by section and column position | Tree-sitter highlighting with the same distinctions; see [highlighting.md](highlighting.md). Rule options are recognized by position, not from the original's modifier word list |
| Live diagnostics; detached profiles resolve against the main profile | Same, using the same CLI |
| CLI path setting, capability check, 3-second timeout, 256 KiB cap | Same; see [language-server.md](language-server.md) |
| `**/*` file watcher | Same, registered on the server's behalf by `surge-lsp.mjs` |
| `Surge: Restart Language Server` command | Zed's built-in `editor: restart language server` |
| `maxRestartCount: 0`, so a CLI without LSP support doesn't crash-loop | When the CLI fails the capability check, the extension returns an error before starting any process |
| Untrusted workspaces unsupported | Zed's Restricted Mode: untrusted projects don't start language servers, and highlighting is unaffected |
| Content detection, folder detection, `surge.autoDetect` | Partly available: first-line detection, modelines, and user `file_types`; see [file-detection.md](file-detection.md). Detection from content past the first line, and re-detection after edits, aren't possible |
| No outline | Outline nested by section |
| Line comments only with `#` | Toggling comments inserts `#`, and `;` and `//` comments are recognized and removed too |
| No icon of its own for files; the VS Code icon theme decides | Zed's language picker icon comes from `path_suffixes`. An extension can only supply its own file icons through a full icon theme the user switches to, so this extension doesn't ship one |
| — | Redaction of passwords and keys in private files (`redactions.scm`) |
