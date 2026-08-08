# codemirror-lang-typst (experimental)

This package provides [Typst](typst.app) language support for the [CodeMirror](codemirror.net) editor.

## Parser

The package includes a native Lezer parser for Typst 0.15 syntax. It produces a
mode-aware concrete syntax tree for markup, code, and math, using the node names
from Typst's official [`typst-syntax` crate](https://crates.io/crates/typst-syntax).

Two language-support functions are available:

- `typst()` only provides a placeholder syntax tree and achieves syntax highlighting via WASM.
- `typst_lezer()` uses the native Lezer parser and Lezer syntax highlighting.
  It does not depend on WASM.

## Usage

```js
import {typst} from "codemirror-lang-typst"

const extensions = [typst()]
```

For the WASM-free Lezer implementation, import the dedicated entry:

```js
import {typst_lezer} from "codemirror-lang-typst/lezer"

const extensions = [typst_lezer()]
```

The standalone parser is also exported from the `/lezer` entry as
`typstParser` and as the conventional `parser` alias.
