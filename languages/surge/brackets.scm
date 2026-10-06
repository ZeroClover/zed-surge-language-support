(_ "[" @open name: (section_name) "]" @close)
(group "(" @open ")" @close)
(conditions "(" @open ")" @close)
(condition "(" @open ")" @close)
; Quotes pair up but are not nesting levels, so rainbow brackets skip them.
((string "\"" @open "\"" @close) (#set! rainbow.exclude))
((string "'" @open "'" @close) (#set! rainbow.exclude))
