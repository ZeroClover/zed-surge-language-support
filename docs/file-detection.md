# File type detection

A Zed extension can declare only three kinds of detection, all statically in `languages/<language>/config.toml`:

- `path_suffixes`: an extension or a complete file name. Zed's language picker also takes a language's icon from these suffixes, so a language without any shows no icon.
- `first_line_pattern`: a regex (Rust `regex` syntax) matched against the first 256 bytes of the first line. It's consulted only when no language claims the file by extension.
- `modeline_aliases`: language names usable in Vim or Emacs modelines. Zed looks for a modeline in the first and last 5 lines of a file (the `modeline_lines` setting), and a modeline wins over the extension.

Users can also add globs for a language with `file_types` in Zed's settings, which take precedence over extensions declared by the extension.

## Current declarations

| Language | `path_suffixes` | `first_line_pattern` | `modeline_aliases` |
| --- | --- | --- | --- |
| Surge Configuration | `sgconf`, `dconf`, `Surge.conf` | Starts with `#!MANAGED-CONFIG` | `surge` |
| Surge Module | `sgmodule` | Starts with `#!name=` | `surge-module` |
| Surge Rule Set | `sgruleset` | A known rule type (`DOMAIN`, `IP-CIDR`, `AND`, …) followed by `,` | `surge-ruleset` |

The modeline aliases match the original VS Code extension's language IDs, e.g. `# vim: set ft=surge-ruleset:` at the top of a file. Surge treats it as an ordinary comment.

The usual approach is to claim files by extension. This extension doesn't claim `.conf`, `.list`, or `.ruleset`: `.conf` and `.list` are used by a great many other formats, `.ruleset` is also the extension of Visual Studio code analysis rule files, and Surge itself prescribes no extension for rule sets. Rule sets claim only `.sgruleset`, which follows the `sg` prefix of the other Surge extensions, so that the language has an icon in the picker. `[General]` isn't used as a first-line signature for profiles either, because Qt applications' `.conf` files start with it too.

`scripts/test-grammar.mjs` has matching and non-matching cases for each `first_line_pattern`; update them along with the pattern.

## What detection can't cover

These cases need a modeline, `file_types`, or manually choosing the language. The README gives `file_types` settings that mirror detection of Surge's local and iCloud Profiles folders.

- Files that can only be identified by content past the first line, such as plain profiles starting with a comment or `[General]`, or rule sets starting with a comment. Zed has no API for extensions to read more of the file. Zed's built-in content detection is a fixed classifier model used only for untitled buffers, and extensions can't hook into it.
- Files whose extension another language already claims. For example, `.txt` belongs to Plain Text, so first-line detection never runs on it. If another installed extension claims `.conf`, first-line detection of managed profiles won't kick in either.
- Re-detecting after the content changes while editing: Zed has no extension callback for document changes.
