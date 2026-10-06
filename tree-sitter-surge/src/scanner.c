#include "tree_sitter/parser.h"

enum TokenType { COMMENT, KEY, NEWLINE, SECTION_BREAK };

void *tree_sitter_surge_external_scanner_create(void) { return NULL; }
void tree_sitter_surge_external_scanner_destroy(void *payload) { (void)payload; }
unsigned tree_sitter_surge_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload; (void)buffer; return 0;
}
void tree_sitter_surge_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload; (void)buffer; (void)length;
}

static bool is_space(int32_t ch) {
  return ch == ' ' || ch == '\t' || ch == '\f' || ch == 0xfeff;
}

// After a line break, report whether the next
// line is a section header. The break itself ends before that line.
static bool scan_break(TSLexer *lexer, const bool *valid) {
  lexer->mark_end(lexer);
  while (is_space(lexer->lookahead)) lexer->advance(lexer, false);
  if (valid[SECTION_BREAK] && lexer->lookahead == '[') {
    lexer->result_symbol = SECTION_BREAK;
    return true;
  }
  if (valid[NEWLINE]) {
    lexer->result_symbol = NEWLINE;
    return true;
  }
  return false;
}

bool tree_sitter_surge_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid) {
  (void)payload;
  bool line_start = lexer->get_column(lexer) == 0;
  bool comment_boundary = line_start;
  while (is_space(lexer->lookahead)) {
    comment_boundary = true;
    lexer->advance(lexer, true);
  }
  // A file may open with a header: emit an empty break before it.
  if (line_start && valid[SECTION_BREAK] && lexer->lookahead == '[') {
    lexer->mark_end(lexer);
    lexer->result_symbol = SECTION_BREAK;
    return true;
  }
  if ((valid[NEWLINE] || valid[SECTION_BREAK]) && (lexer->lookahead == '\r' || lexer->lookahead == '\n')) {
    if (lexer->lookahead == '\r') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '\n') lexer->advance(lexer, false);
    } else {
      lexer->advance(lexer, false);
    }
    return scan_break(lexer, valid);
  }
  if (valid[COMMENT] && comment_boundary) {
    int32_t first = lexer->lookahead;
    if (first == '#' || first == ';' || first == '/') {
      lexer->advance(lexer, false);
      if (first == '#' && lexer->lookahead == '!') return false;
      if (first == '/' && lexer->lookahead != '/') return false;
      while (!lexer->eof(lexer) && lexer->lookahead != '\r' && lexer->lookahead != '\n') lexer->advance(lexer, false);
      lexer->mark_end(lexer);
      lexer->result_symbol = COMMENT;
      return true;
    }
  }
  if (!valid[KEY]) return false;
  bool has_name = false;
  while (!lexer->eof(lexer)) {
    int32_t ch = lexer->lookahead;
    if (ch == '=') {
      lexer->result_symbol = KEY;
      return has_name;
    }
    // These delimiters identify rules, sections, quoted text, and rewrites.
    // An apostrophe inside a name is text, as in "Zero's Proxy".
    if (ch == '\r' || ch == '\n' || ch == ',' || ch == '[' || ch == ']' ||
        ch == '(' || ch == ')' || ch == '"' || (ch == '\'' && !has_name) || ch == '^' ||
        ch == '#' || ch == ';' || ch == '/' || ch == '\\') return false;
    lexer->advance(lexer, false);
    if (ch != ' ' && ch != '\t') {
      has_name = true;
      lexer->mark_end(lexer);
    }
  }
  return false;
}
