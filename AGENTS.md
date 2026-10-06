# Surge for Zed

A Zed extension that highlights Surge profiles, modules, and rule sets, and connects the `surge-cli lsp` bundled with the user's own Surge for Mac to Zed as a source of diagnostics. Highlighting comes from this repository's Tree-sitter grammar and doesn't depend on Surge. All semantic validation of a configuration belongs to surge-cli; this repository implements no Surge validation logic.

The project uses Surge Networks' official VS Code extension `SurgeNetworks.surge-language-support` as its feature reference. It is not an official extension and contains none of that extension's code.

## Modules

| Path | Responsibility | Details |
| --- | --- | --- |
| `tree-sitter-surge/` | Grammar definition `grammar.js` and external scanner `src/scanner.c`; `src/parser.c` and friends are generated | [docs/grammar.md](docs/grammar.md) |
| `languages/<language>/` | `config.toml` and Tree-sitter queries for each of the three languages | [docs/highlighting.md](docs/highlighting.md), [docs/file-detection.md](docs/file-detection.md) |
| `server/surge-lsp.mjs` | Runs on Zed's bundled Node.js: checks the CLI, relays LSP messages, and registers the file watcher | [docs/language-server.md](docs/language-server.md) |
| `src/lib.rs` | Extension entry point compiled to a WASI component; reads settings and returns the language server command | [docs/language-server.md](docs/language-server.md) |
| `scripts/` | Tests and copying the shared queries | [docs/build.md](docs/build.md) |
| `examples/` | Synthetic samples for checking the result by eye in Zed; `npm test` parses them too | — |

## Commands

```sh
npm test                      # grammar, highlight colors, queries, first-line detection
cargo test                    # Rust unit tests
node scripts/test-lsp.mjs     # talks to the real local surge-cli through server/surge-lsp.mjs
```

After changing `grammar.js` or `scanner.c`, run `npm run generate`. Zed fetches the grammar from GitHub at the `rev` pinned in `extension.toml`, so grammar changes reach Zed only after they're pushed and `rev` moves; see [docs/build.md](docs/build.md), which also covers the other build and install steps.

## Constraints

- Edit queries only under `languages/surge/`. `npm run sync-queries` copies them to the other two languages, and `npm test` checks that all three copies match.
- `server/surge-lsp.mjs` is compiled into the extension's wasm through `include_str!`, so changes take effect only after rebuilding the wasm.
- Tests use synthetic documents in temporary directories only. surge-cli and the user's Surge configuration belong to the user's machine: don't connect to the Surge Controller, and don't read or write the user's real configuration.
- The original VS Code extension is licensed all rights reserved. Read it to compare behavior, but don't copy its JavaScript, TextMate grammars, or icon, and don't distribute surge-cli with this project.
- User-facing text is in English, as the Zed extension registry requires: docs, error messages, and the manifest.

## Read when needed

- Changing grammar structure, adding a section type, or fixing parse errors: [docs/grammar.md](docs/grammar.md)
- Changing colors, the outline, brackets, or redaction queries: [docs/highlighting.md](docs/highlighting.md)
- Changing diagnostics, the CLI check, or file watching: [docs/language-server.md](docs/language-server.md)
- Changing file type detection: [docs/file-detection.md](docs/file-detection.md)
- Building the wasm or installing into the local Zed: [docs/build.md](docs/build.md)
- Comparing behavior with the original VS Code extension, or deciding whether a feature is possible in Zed: [docs/vscode-parity.md](docs/vscode-parity.md)
