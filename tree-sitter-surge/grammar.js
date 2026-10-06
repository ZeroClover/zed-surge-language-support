// A tolerant, section-aware concrete syntax tree. Semantic validity belongs to surge-cli.
// Each section owns its body lines, so queries can tell a policy, a regex, and a value apart.
const list = item => seq(item, repeat(seq(',', optional(item))));

module.exports = grammar({
  name: 'surge',
  extras: _ => [/[\t \f\uFEFF]+/],
  externals: $ => [$.comment, $.key, $._newline, $._section_break],
  rules: {
    // The scanner reports a newline before a '[' line as a section break, so a
    // header always starts a line and every section owns the lines up to the next one.
    document: $ => seq(
      optional($._top_line), repeat(seq($._newline, optional($._top_line))),
      repeat(seq($._section_break, choice(
        $.rule_section, $.ruleset_section, $.proxy_section, $.proxy_group_section,
        $.url_rewrite_section, $.header_rewrite_section, $.body_rewrite_section,
        $.map_local_section, $.section,
      ))),
    ),
    // Rule sets have no sections; profiles and modules only put metadata here.
    _top_line: $ => choice($.directive, $.comment, alias($._ruleset_rule, $.rule), $.assignment, $.text_line),

    section: $ => body($, header($, $.section_name), $._line),
    rule_section: $ => body($, header($, alias('Rule', $.section_name)), alias($._policy_rule, $.rule), true),
    ruleset_section: $ => body($, header($, alias(token(prec(1, /Ruleset[ \t]+[^\]\r\n]+/)), $.section_name)), alias($._ruleset_rule, $.rule), true),
    proxy_section: $ => body($, header($, alias('Proxy', $.section_name)), $.proxy, true),
    proxy_group_section: $ => body($, header($, alias('Proxy Group', $.section_name)), $.proxy_group, true),
    url_rewrite_section: $ => body($, header($, alias('URL Rewrite', $.section_name)), $.url_rewrite),
    header_rewrite_section: $ => body($, header($, alias('Header Rewrite', $.section_name)), $.header_rewrite),
    body_rewrite_section: $ => body($, header($, alias('Body Rewrite', $.section_name)), $.body_rewrite),
    map_local_section: $ => body($, header($, alias('Map Local', $.section_name)), $.map_local),
    section_name: _ => /[^\]\r\n]+/,

    directive: $ => seq(token(prec(3, '#!')), field('name', $.directive_name), repeat($._part), optional($.comment)),
    directive_name: _ => /[a-zA-Z][a-zA-Z0-9_-]*/,
    _line: $ => choice($.assignment, $.text_line),
    // Lines that fit no section form stay readable instead of becoming errors.
    text_line: $ => prec(-1, seq($._first_part, repeat($._part), optional($.comment))),

    // name = value, value, param=value
    assignment: $ => seq(field('name', $.key), '=', optional(list($._item)), optional($.comment)),
    proxy: $ => seq(field('name', $.key), '=', field('type', alias($.atom, $.type)), repeat(seq(',', optional($._item))), optional($.comment)),
    proxy_group: $ => seq(field('name', $.key), '=', field('type', alias($.atom, $.type)), repeat(seq(',', optional(choice($.param, alias($.value, $.policy))))), optional($.comment)),
    _item: $ => choice($.param, $.value),
    value: $ => repeat1(choice($.atom, $.string, $.placeholder, $.group, '[', ']', '{', '}')),
    param: $ => seq(field('name', $.atom), '=', optional(field('value', $.param_value))),
    param_value: $ => repeat1(choice($.text, $.string, $.placeholder, '{')),

    // TYPE,value,policy,options
    _policy_rule: $ => seq(choice(
      seq(field('type', alias(keyword('FINAL'), $.rule_type)), optional(seq(',', $._policy_tail))),
      seq($._condition, optional(seq(',', $._policy_tail))),
    ), optional($.comment)),
    _policy_tail: $ => seq(field('policy', $.policy), repeat(seq(',', optional(field('option', $.value))))),
    policy: $ => repeat1(choice($.atom, $.string, $.placeholder)),
    _ruleset_rule: $ => seq($._condition, repeat(seq(',', optional(field('option', $.value)))), optional($.comment)),
    _condition: $ => choice(
      $._logical,
      seq(field('type', alias(keyword('URL-REGEX'), $.rule_type)), ',', field('value', choice($.string, $.regex))),
      seq(field('type', $.rule_type), ',', optional(field('value', $.value))),
    ),
    _logical: $ => seq(field('type', alias(choice(keyword('AND'), keyword('OR'), keyword('NOT')), $.rule_type)), ',', field('value', $.conditions)),
    conditions: $ => seq('(', list($.condition), ')'),
    // Inside parentheses an unquoted regex cannot contain ')' or ','.
    condition: $ => seq('(', choice($._logical, seq(field('type', $.rule_type), ',', optional(field('value', $.value)))), ')'),
    rule_type: _ => token(prec(1, /[A-Z][A-Z0-9-]*/)),

    // pattern replacement [mode]
    url_rewrite: $ => seq(field('pattern', $.regex), optional(seq(field('replacement', $.replacement), optional(field('mode', $.atom)))), optional($.comment)),
    // [direction] pattern action header [value]
    header_rewrite: $ => seq(
      optional(field('direction', alias(choice('http-request', 'http-response'), $.direction))),
      field('pattern', $.regex),
      optional(seq(
        field('action', alias(choice('header-add', 'header-del', 'header-replace', 'header-replace-regex'), $.action)),
        optional(seq(field('header', $.atom), optional(field('value', $.rest)))),
      )),
      optional($.comment),
    ),
    // direction pattern (find replacement)*, or a jq expression
    body_rewrite: $ => seq(choice(
      seq(field('direction', alias(choice('http-request', 'http-response'), $.direction)), field('pattern', $.regex),
        repeat(seq(field('find', choice($.string, $.regex)), field('replacement', choice($.string, $.replacement))))),
      seq(field('direction', alias(choice('http-request-jq', 'http-response-jq'), $.direction)), field('pattern', $.regex), optional(field('expression', $.rest))),
    ), optional($.comment)),
    // pattern key=value ...
    map_local: $ => seq(field('pattern', $.regex), repeat(alias($._spaced_param, $.param)), optional($.comment)),
    // A required value keeps 'data-type=text data=...' from reading 'text' as the next name.
    _spaced_param: $ => seq(field('name', $.atom), '=', field('value', alias($._spaced_value, $.param_value))),
    _spaced_value: $ => choice($.string, $.text),

    rest: $ => repeat1($._part),
    _first_part: $ => choice($.string, $.placeholder, $.pattern_escape, $.atom, $.group, ',', '=', ']', '{', '}'),
    _part: $ => choice($._first_part, '['),
    pattern_escape: _ => token(prec(2, choice('\\(', '\\)', '\\[', '\\]', '\\{', '\\}'))),
    group: $ => seq('(', repeat($._part), ')'),
    string: $ => choice(
      seq('"', repeat(choice($.escape, $.placeholder, token.immediate(/[^"\\\r\n{]+/), token.immediate('{'))), '"'),
      seq("'", repeat(choice($.escape, $.placeholder, token.immediate(/[^'\\\r\n{]+/), token.immediate('{'))), "'"),
    ),
    escape: _ => token.immediate(/\\[^\r\n]/),
    placeholder: _ => token(prec(5, /\{\{\{[^}\r\n]+\}\}\}/)),
    // An apostrophe inside a word is text, as in Surge itself: Zero's Proxy, password=it's.
    atom: _ => token(/[^\s,=()"'{}\[\]][^\s,=()"{}\[\]]*/),
    // Parameter values keep =, parentheses, and brackets, e.g. pattern=^https://a\.com/(x|y)\?q=1.
    text: _ => token(/[^\s,"'{][^\s,"{]*/),
    regex: _ => token(/[^\s,"'#;][^\s,]*/),
    replacement: $ => seq($._replacement_piece, repeat(choice(
      // Adjacent pieces outrank a new regex token, e.g. $2-$1.
      alias(token.immediate(prec(3, /\$\d+/)), $.capture), token.immediate(prec(2, /[^\s$]+/)), token.immediate(prec(2, '$')),
    ))),
    _replacement_piece: $ => choice(alias(/\$\d+/, $.capture), /[^\s$#;"'][^\s$]*/, '$'),
  },
});

function header($, name) {
  return seq('[', field('name', name), ']', optional($.comment));
}

// Rule keywords outrank the generic rule type token.
function keyword(word) {
  return token(prec(2, word));
}

// Body lines are directives, comments, or the section's own line kind. A text
// fallback keeps one malformed line from turning the whole section into an error.
function body($, head, line, fallback = false) {
  const lines = fallback ? [$.directive, $.comment, line, $.text_line] : [$.directive, $.comment, line];
  return seq(head, repeat(seq($._newline, optional(choice(...lines)))));
}
