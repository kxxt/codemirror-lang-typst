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

`typst_lezer()` also registers CodeMirror autocomplete data for Typst 0.15's
built-in functions, types, modules, constants, and math symbols. Add
CodeMirror's `autocompletion()` extension to your editor to display them:

```js
import {autocompletion} from "@codemirror/autocomplete"
import {typst_lezer} from "codemirror-lang-typst/lezer"

const extensions = [typst_lezer(), autocompletion()]
```

Completions understand built-in field access, including symbol modifiers such
as `arrow.r`, nested modifiers such as `arrow.r.long`, and namespaces such as
`sym.arrow`, `math.sqrt`, `calc.sin`, and `sys.version`.

References complete labels declared anywhere in the document. For example,
typing `@sec` offers a declaration such as `<section:introduction>`.

Built-in calls also complete their parameter names and accepted values. The
metadata is generated from Typst 0.15's reflected function signatures. For
example, `strike(` offers `stroke:`, `offset:`, `extent:`, and `background:`,
while `strike(stroke: ` offers `auto`, named colors, length values, gradients,
strokes, tilings, and dictionaries. Literal enums and set-rule parameters are
supported as well.

Autocomplete also follows lexical scope for document-local `let` variables,
named and closure-valued functions, function parameters, destructuring
bindings, and `for` loop bindings. Local definitions shadow built-ins and are
only suggested where they are visible.

The native Lezer support also provides automatic indentation for code and
content blocks, multiline calls and collections, function parameters, math
arguments, and nested list content. Closing delimiters dedent automatically.
Enter splits list content at the cursor into a sibling item with the appropriate
marker (or creates an empty sibling at the end). Shift-Enter instead starts an
indented continuation line without a marker.

Code folding is available for code and content blocks, multiline calls and
collections, math delimiters, raw blocks, block comments, nested list bodies,
and heading sections.

`typst_lezer()` also enables WASM-free syntax linting for malformed tokens,
missing expressions and separators, unclosed delimiters, raw blocks, labels,
links, strings, and nested block comments. Diagnostics appear inline and in
CodeMirror's lint tooltip. Applications can add `lintGutter()` from
`@codemirror/lint` when they also want gutter markers.

Autocomplete is intentionally not registered by the legacy `typst()` support.

## Publishing

The `publish.yml` GitHub Actions workflow publishes a release through npm
trusted publishing when a `v<package-version>` tag is pushed. Prereleases use
their prerelease identifier as the npm dist-tag (for example, `alpha`), while
stable versions use `latest`.

Configure the npm trusted publisher for the `kxxt/codemirror-lang-typst`
repository with the workflow filename `publish.yml` and allow `npm publish`.
The workflow uses GitHub OIDC and does not require an `NPM_TOKEN` secret.
