# Highlighting and queries

The query files live in `languages/surge/`. `npm run prepare:extension` copies them to `surge-module` and `surge-ruleset`:

| File | Purpose |
| --- | --- |
| `highlights.scm` | Syntax highlighting |
| `outline.scm` | Outline: sections, plus the `assignment`, `proxy`, and `proxy_group` entries inside them |
| `brackets.scm` | Bracket matching: section headers, `group`, `conditions`, `condition`, and string quotes. Quotes are marked `rainbow.exclude` because they pair up without nesting, so rainbow brackets would only add noise |
| `overrides.scm` | Marks `string` and `comment` ranges for the `not_in` field of the brackets in `config.toml` |
| `redactions.scm` | Secrets that Zed hides in private files: proxy `password`, `psk`, `token`, `uuid`, `passphrase`, `private-key`, `preshared-key` parameters, plus the values of `http-api`, `external-controller-access`, `ca-passphrase`, `ca-p12`, `private-key`, and `preshared-key` settings. Zed applies it only to files matched by the user's `private_files` with `redact_private_values` on |

## Zed's capture precedence

Zed pushes captures onto a stack in iteration order. The color at a position comes from the most recently pushed capture that still covers it (`BufferChunks` in `crates/language/src/buffer.rs`). For the same node, the later pattern wins; captures on child nodes override their parent.

`highlights.scm` is therefore ordered from general to specific: first every value is colored as a string, then shape-based patterns override that with numbers, booleans, and links, then structural patterns override with policies, regexes, and so on, and placeholders and comments come last. Capture leaf tokens rather than parent nodes where you can; otherwise child captures from other patterns inside the parent will override it.

Neovim also lets the later capture win, but tree-sitter-highlight and the highlight assertions of `tree-sitter test` let the earlier one win. That's why this repository doesn't use `tree-sitter test` to check colors. Instead, `scripts/test-grammar.mjs` runs `tree-sitter query --captures`, computes the final color at each position using Zed's rule, and asserts on it.

Write a pattern and its predicates as a single unit, e.g. `([(atom) (text)] @number (#match? @number "..."))`. A predicate on its own line after the pattern is parsed as a separate pattern, and the capture it was supposed to constrain then matches every node.

## Color mapping

Capture names use the keys Zed themes support. A key missing from a theme (such as `variable.parameter`) falls back to its prefix (`variable`).

| Content | Capture |
| --- | --- |
| Section names | `@title` |
| The `#!` module directive marker and directive names | `@preproc` |
| Setting names, parameter names | `@property` |
| Names in `[Proxy]` / `[Proxy Group]`, entry names in `[Script]` | `@function` |
| Proxy protocols, policy group types, the `type=` value in `[Script]` | `@type` |
| The policy column of rules, policy group members | `@function` |
| `DIRECT`, `REJECT`, `REJECT-DROP`, `REJECT-TINYGIF`, `REJECT-NO-DROP` | `@constant.builtin` |
| Rule types, `AND`/`OR`/`NOT`, `FINAL` | `@keyword` |
| Rule options (every column after the policy) | `@attribute` |
| `URL-REGEX` values, `pattern=`, `policy-regex-filter=`, Rewrite and Map Local patterns | `@string.regex` |
| Rewrite directions and actions, URL Rewrite modes (`302`, `header`, …) | `@keyword` |
| Header names in Header Rewrite | `@variable.parameter` |
| `$1` in replacements, module arguments `{{{name}}}` | `@variable.special` |
| Plain values | `@string`, changed by shape to `@number`, `@boolean`, or `@link_uri`; `%APPEND%` and `%INSERT%` are `@keyword` |

Rule options are recognized by position rather than from a word list: every column after the policy in `[Rule]`, and after the value in rule sets, is an option. That way, new Surge options need no list to maintain.

## After changing queries

Add color assertions to the cases in `scripts/test-grammar.mjs`, written as `[line, snippet, expected capture, occurrence]`; they check the final color of the snippet's first character. Redaction captures are asserted separately near the end of the same script. Then run `npm run prepare:extension` and `npm test`.
