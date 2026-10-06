# Tree-sitter grammar

`tree-sitter-surge/` defines a single grammar shared by all three languages. Its job is to give the highlight queries enough structure, not to decide whether a configuration is valid; validity is surge-cli's job. The grammar is therefore deliberately forgiving: anything it doesn't recognize falls back to plain text instead of producing large `ERROR` nodes.

The three languages share one grammar because their line syntax is identical. They differ only in file structure, which the grammar handles itself (see "Top-level lines" below).

## Document structure

```
document
├── top-level lines (before the first section)
└── section × N (each holds its header line and every line up to the next header)
```

Sections own their body lines, so queries can tell meanings apart by section — for example, coloring entry names as functions only inside `[Script]`.

The external scanner `src/scanner.c` decides where sections begin. At each newline it peeks at the first non-whitespace character of the next line: if it's `[`, the newline is reported as `_section_break`, otherwise as an ordinary `_newline`. When a file starts with `[`, the scanner emits a zero-width `_section_break` at position 0. A `[` at the start of a line therefore always opens a new section, which matches the original VS Code extension.

The scanner also produces two context-sensitive tokens:

- `comment`: `#`, `;`, and `//` start a comment only at the beginning of a line or after whitespace, so `#` and `//` inside URLs aren't comments. Lines starting with `#!` are module directives, not comments.
- `key`: the setting name before `=`. It may contain spaces and non-ASCII characters (as in `香港 节点 = ...`). A name can't start with `'`, and the scanner gives up on `,`, `[`, `(`, `"`, `^`, `#`, `;`, `/`, or `\`, so rules and regexes aren't mistaken for settings.

## Section types

When a header exactly matches a Surge section name (case-sensitive), the section gets a dedicated line structure. Every other section is a generic `section`.

| Section | Node | Line structure |
| --- | --- | --- |
| `[Rule]` | `rule_section` | `rule`: `type`, `value`, `policy`, `option`. `FINAL` has only a policy; the value of `AND`/`OR`/`NOT` is `conditions`; the value of `URL-REGEX` is a `regex` or `string` |
| `[Ruleset name]` | `ruleset_section` | The same `rule` as in rule set files, without `policy` |
| `[Proxy]` | `proxy_section` | `proxy`: `name`, `type`, then values and `param`s |
| `[Proxy Group]` | `proxy_group_section` | `proxy_group`: `name`, `type`, then `policy` and `param` entries |
| `[URL Rewrite]` | `url_rewrite_section` | `url_rewrite`: `pattern`, `replacement`, `mode` |
| `[Header Rewrite]` | `header_rewrite_section` | `header_rewrite`: optional `direction`, then `pattern`, `action`, `header`, `value` |
| `[Body Rewrite]` | `body_rewrite_section` | `body_rewrite`: `direction`, `pattern`, then `find` / `replacement` pairs, or an `expression` for the `-jq` directions |
| `[Map Local]` | `map_local_section` | `map_local`: `pattern`, then space-separated `param`s |
| Anything else | `section` | `assignment`: `name = value, param=value, ...`; lines that don't fit become `text_line` |

Unrecognized lines in `[Rule]`, `[Ruleset …]`, `[Proxy]`, and `[Proxy Group]` fall back to `text_line`, so one error doesn't spread through the whole section. The first column of the Rewrite and Map Local sections is a `regex` that accepts any non-whitespace text, so those sections don't need the fallback.

`[Script]`, `[MITM]`, `[Host]`, `[General]`, and the rest are well served by the generic `assignment`; the highlight queries tell them apart by section name (see [highlighting.md](highlighting.md)).

## Top-level lines

Lines before the first section can be module directives (`#!name=...`), comments, `assignment`s, `text_line`s, or `rule`s without a policy. Rule set files have no sections, so the whole file is top-level lines and its rules are these `rule`s.

## Value tokens

The same text gets a different token depending on where it appears, because each position allows different characters:

| Token | Where it appears | Allowed characters |
| --- | --- | --- |
| `atom` | Plain values, policies, parameter names | No whitespace or `,=()"{}[]`; `'` only mid-word, so `Zero's Proxy` is plain text |
| `text` | `param` values | Also allows `=` and brackets, so `pattern=^https://a\.com/(x|y)\?q=1` is a single value |
| `regex` | Rewrite and Map Local patterns, `URL-REGEX` values | Anything except whitespace and `,` |
| `replacement` | Replacement strings | Literal text and `capture`s (`$1`) |
| `string` | Anywhere | `"…"` or `'…'`, closed on the same line; may contain `escape` and `placeholder` |
| `placeholder` | Anywhere | Module arguments, `{{{name}}}` |

Condition values inside the parentheses of logical rules use `value` and can't contain an unquoted `)` or `,`. Surge splits rules on commas anyway, so a regex containing a comma already has to be quoted.

## After changing the grammar

1. Run `npm run generate` to regenerate `src/parser.c`. A conflict during generation usually means some line rule can still accept `[` or another symbol at the end of a line. Prefer narrowing a token or having the scanner supply context over adding `conflicts`.
2. Run `npm run prepare:extension` to refresh the local grammar snapshot and point `rev` in `extension.toml` at it.
3. Run `npm test`. When adding a section type or fixing a parse problem, add a case to `cases` in `scripts/test-grammar.mjs` that asserts both the nodes and the final colors.

Zed reparses half-typed input on every keystroke: a lone `[`, an unfinished header, an unclosed quote. After changing the scanner, try these inputs to confirm that parsing still returns and that errors stay on the current line.
