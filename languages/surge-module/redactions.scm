; Zed hides these values in files matched by `private_files` when `redact_private_values` is on.
(param
  name: (atom) @_name
  value: (param_value) @redact
  (#any-of? @_name "password" "psk" "token" "uuid" "passphrase" "private-key" "preshared-key"))

(assignment
  name: (key) @_name
  (value) @redact
  (#any-of? @_name "ca-passphrase" "ca-p12" "http-api" "external-controller-access" "private-key" "preshared-key"))
