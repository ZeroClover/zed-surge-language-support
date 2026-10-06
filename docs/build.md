# Building and installing

## Toolchain

- Node.js and the `tree-sitter-cli` installed by `npm ci` (version pinned in `package.json`). The grammar is generated for ABI 14.
- Rust installed through rustup. Zed adds the `wasm32-wasip2` target itself, and the target ships its own `wasm-component-ld` linker. Homebrew's rustc doesn't work: it lacks that target and can't use the official prebuilt std (it's built differently and fails with `E0514`).

The extension API is pinned to `zed_extension_api = "=0.7.0"` in `Cargo.toml`.

## Grammar snapshot

`[grammars.surge]` in `extension.toml` points to a `file://` URL for `.build/grammar-repository` and a specific commit. Zed requires the grammar to come from a pinned commit of a git repository, and this project has no public remote yet, so `npm run prepare:extension` (`scripts/prepare.mjs`):

1. Copies the queries from `languages/surge/` to the other two languages.
2. Copies `grammar.js`, `tree-sitter.json`, and `src/` from `tree-sitter-surge/` into `.build/grammar-repository` and commits them.
3. Rewrites `repository` and `rev` in `extension.toml` to point at that snapshot.

Run it again after moving the project folder or changing the grammar. Before publishing to the Zed extension registry, `repository` has to become a public repository URL with the matching commit.

## Dev install

```sh
npm ci
npm run generate
npm run prepare:extension
```

Then run `zed: install dev extension` in Zed and pick the project root. Zed compiles the Rust code and the grammar itself, downloading wasi-sdk for the grammar unless `WASI_SDK_PATH` points to an existing one. Its build output (`extension.wasm`, `grammars/`) lands in the project root and is gitignored. The Zed extension registry builds published versions the same way from the submitted commit, so there's no separate packaging step.

## Verification

```sh
npm test
cargo test
node scripts/test-lsp.mjs
```

These cover the grammar, colors, detection rules, and the language server, but not how Zed actually renders things. After changing highlighting, install and reload the extension, then open the files in `examples/` and look.
