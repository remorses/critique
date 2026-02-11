; JSON highlights query for critique
; Uses captures compatible with themes.ts mappings
; No predicates (like #set! or #eq?) that are unsupported by web-tree-sitter

(pair
  key: (string) @property)

(pair
  value: (string) @string)

(array
  (string) @string)

(number) @number

[
  (true)
  (false)
] @boolean

(null) @constant

(escape_sequence) @string

[
  ","
  ":"
] @punctuation.delimiter

[
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket
