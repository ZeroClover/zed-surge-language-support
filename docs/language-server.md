# Language server

Diagnostics come from `surge-cli lsp --stdio`, which ships with the user's own Surge for Mac. It runs offline, never connects to the Surge Controller, and supports the language IDs `surge`, `surge-module`, and `surge-ruleset`. The server declares only full-text sync, open/close/save notifications, and diagnostics. It has no completion, hover, go-to-definition, or formatting, and this extension doesn't provide them either.

## Startup chain

```
Zed ──> src/lib.rs (wasm) ──returns command──> node surge-lsp.mjs serve <cli> lsp --stdio ──> surge-cli
```

`language_server_command` in `src/lib.rs` goes through these steps:

1. On anything other than macOS, it returns an error, because surge-cli exists only in Surge for Mac.
2. It reads the `lsp.surge.binary` setting. `path` defaults to `/Applications/Surge.app/Contents/Applications/surge-cli` and expands `~/`; a bare name without `/` is looked up on the worktree's PATH. `arguments` defaults to `["lsp", "--stdio"]`, and `env` is passed through to the child process unchanged.
3. It writes `server/surge-lsp.mjs`, embedded at compile time, into the extension's work directory. Zed mounts that directory into the wasm at its absolute host path, so the path from `current_dir()` can be handed straight to Node.js on the host.
4. It gets the Zed-managed Node.js from `zed::node_binary_path()` and runs `surge-lsp.mjs check <cli>`. The check passes when the exit code is 0 and a `Usage:` line in the output declares the `lsp` subcommand with a `--stdio` flag.
5. It returns `node surge-lsp.mjs serve <cli> <arguments...>`.

Step 4 checks the capability the CLI advertises rather than its version number: Surge for Mac 6.10.0 build 12400 lacks LSP support, while build 12460 has it.

The `process:exec` capability in `extension.toml` is `command = "*"`, `args = ["*", "check", "*"]`. The command is a wildcard because the path of Zed's managed Node.js varies from machine to machine; pinning the argument positions limits execution to `check` mode.

## surge-lsp.mjs

The usual approach is for an extension to return the language server's command directly. This extension adds a Node.js layer because Zed's extension API can't do two things:

- **A time-limited check.** Zed's `process::Command::output()` has no timeout or output cap. `check` mode runs `help lsp` with `execFileSync`, a 3-second timeout, and a 256 KiB output cap, the same limits as the original VS Code extension.
- **File watching.** surge-cli re-checks open documents as soon as it receives `workspace/didChangeWatchedFiles`, but it never registers a watcher itself. Zed sends these notifications only for globs a server registers dynamically, and an extension can't register one on the server's behalf. The original VS Code extension registers `**/*` on the client side (`synchronize.fileEvents` in its `extension.js`), noting that includes can have any extension and that the server coalesces events. `serve` mode does the same from the server side: after forwarding the client's `initialized` notification, it sends Zed a `client/registerCapability` request with the id `surge-zed-watch-files` for `**/*`, then swallows Zed's response to that request.

In both directions, `serve` mode splits the stream into complete messages by `Content-Length` before writing them out, so the injected request never lands in the middle of a server message. surge-cli's stderr goes straight through to Zed's language server log. When the server exits, the script exits with the same code; `SIGTERM`, `SIGINT`, and `SIGHUP` are forwarded to surge-cli.

## surge-cli protocol details

Observed on Surge for Mac 6.10.0 build 12460:

- Positions are UTF-16 and text sync is full.
- The `shutdown` request's `params` must be an object; `null` gets `-32602 Expected object parameters`. Zed's messages are fine; hand-written clients such as the test script need to send `{}`.
- Policies referenced from a detached profile (`.dconf`) are resolved from the main profile when it's open at the same time.
- Files pulled in by `#!include` in the main profile don't need to be open: the CLI re-reads them from disk whenever the main profile is saved or edited.

## Tests

`node scripts/test-lsp.mjs [cli path]` connects to the real CLI through `surge-lsp.mjs`, using only synthetic documents in a temporary directory. It verifies:

- the result of `check` mode for supported and unsupported commands;
- for all three language IDs, that invalid text produces diagnostics and an unsaved fix clears them;
- that a detached profile resolves policies from the main profile;
- the contents of the watcher registration;
- that a file change notification alone refreshes diagnostics for an open profile.

It needs a locally installed Surge for Mac with LSP support.
