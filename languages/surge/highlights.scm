; Zed applies the last matching capture, so general rules come first.

; Values
[(atom) (text)] @string
(string) @string
(replacement) @string
(escape) @string.escape
(pattern_escape) @string.escape

([(atom) (text)] @number
  (#match? @number "^[0-9]+(\\.[0-9]+)?$"))
([(atom) (text)] @number
  (#match? @number "^[0-9]{1,3}(\\.[0-9]{1,3}){3}(/[0-9]+)?$"))
([(atom) (text)] @boolean
  (#any-of? @boolean "true" "false" "enabled" "disabled"))
([(atom) (text)] @link_uri
  (#match? @link_uri "^(https?|socks5|file)://"))
([(atom) (text)] @keyword
  (#any-of? @keyword "%APPEND%" "%INSERT%"))

; Punctuation
"=" @operator
"," @punctuation.delimiter
["[" "]" "(" ")"] @punctuation.bracket

; Sections and metadata
(section_name) @title
"#!" @preproc
(directive_name) @preproc

; Names
(key) @property
(param name: (atom) @property)
(proxy name: (key) @function)
(proxy_group name: (key) @function)
(section
  name: (section_name) @_section
  (assignment name: (key) @function)
  (#eq? @_section "Script"))
(type) @type

; Script entries: type=cron, pattern=<regex>
(section
  name: (section_name) @_section
  (assignment
    (param
      name: (atom) @_name
      value: (param_value (text) @type)))
  (#eq? @_section "Script")
  (#eq? @_name "type"))
(param
  name: (atom) @_name
  value: (param_value [(text) (string)] @string.regex)
  (#any-of? @_name "pattern" "policy-regex-filter"))

; Rules
(rule_type) @keyword
(rule option: (value (atom) @attribute))
(rule type: (rule_type) @_type value: (string) @string.regex
  (#eq? @_type "URL-REGEX"))
(policy [(atom) (string)] @function)
(proxy_group (policy [(atom) (string)] @function))

; Built-in policies, wherever a policy may appear
([(atom) (text)] @constant.builtin
  (#match? @constant.builtin "^(DIRECT|REJECT(-DROP|-TINYGIF|-NO-DROP)?)$"))

; Rewrites and Map Local
(regex) @string.regex
(capture) @variable.special
(url_rewrite mode: (atom) @keyword)
(direction) @keyword
(action) @keyword
(header_rewrite header: (atom) @variable.parameter)

; Highest priority
(placeholder) @variable.special
(comment) @comment
