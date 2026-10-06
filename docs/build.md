# Building and installing

## Toolchain

- Node.js and the `tree-sitter-cli` installed by `npm ci` (version pinned in `package.json`). The grammar is generated for ABI 14.
- Rust installed through rustup. Zed adds the `wasm32-wasip2` target itself, and the target ships its own `wasm-component-ld` linker. Homebrew's rustc doesn't work: it lacks that target and can't use the official prebuilt std (it's built differently and fails with `E0514`).

The extension API is pinned to `zed_extension_api = "=0.7.0"` in `Cargo.toml`.

## Grammar source

Zed loads a grammar from a pinned commit of a git repository. `[grammars.surge]` in `extension.toml` points at this repository on GitHub, with `path = "tree-sitter-surge"` and `rev` set to the latest commit that changed `tree-sitter-surge/`. Zed fetches that commit even for a dev install, so the grammar it compiles is the pushed one, not your working copy. `npm test` fails when a committed grammar change isn't reflected in `rev`.

To ship a grammar change:

1. Commit the change under `tree-sitter-surge/` and push it.
2. Set `rev` to that commit's full hash, then commit and push `extension.toml`.

To try an unpushed grammar change in Zed, temporarily set `repository` to this checkout's `file://` URL (for example `file:///Volumes/Git/zed-surge-language-support`) and `rev` to a local commit, then rebuild the dev extension. Restore the GitHub URL before committing.

## Dev install

Run `zed: install dev extension` in Zed and pick the project root; it needs only Rust, not the npm toolchain. Zed compiles the Rust code and the grammar itself, downloading wasi-sdk for the grammar unless `WASI_SDK_PATH` points to an existing one. Its build output (`extension.wasm`, `grammars/`) lands in the project root and is gitignored. The Zed extension registry builds published versions the same way from the submitted commit, so there's no separate packaging step. After changing the extension, use the Rebuild button on the extension's card in Zed's Extensions page.

## Verification

```sh
npm test
cargo test
node scripts/test-lsp.mjs
```

These cover the grammar, colors, detection rules, and the language server, but not how Zed actually renders things. After changing highlighting, install and reload the extension, then open the files in `examples/` and look.
