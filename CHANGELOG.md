# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.6.0] - 2026-08-09

### Added

- Added document-label autocomplete for Typst references after `@`.
- Added syntax linter to `typst_lezer()` through CodeMirror's
  lint integration.
- Added configurable mixed-language parsing and highlighting inside fenced raw
  blocks through `codeLanguages` and `defaultCodeLanguage`.

## [0.5.0] - 2026-08-08

### Breaking Changes

- Updated the bundled Typst syntax implementation and WASM highlighter to
  Typst 0.15.
- The old hacky and buggy WASM parser is removed. Now it only returns an empty
  placeholder syntax tree. For `typst()`, now the syntax highlighting is provided
  by a custom highlighter implemented through WASM binding.
- The style tags are updated to match what is used in the official typst.app.

### Added

- Added `typst_lezer()`, a brand-new WASM-free CodeMirror language
  implementation backed by a native Lezer parser for Typst 0.15 markup, code,
  and math syntax.
- Added Lezer-based syntax highlighting using the Typst web app's light-theme
  colors and highlighting categories.
- Added autocomplete for Typst 0.15 built-in functions, variables, types,
  constants, modules, math functions, and symbols.
- Added property completion for built-in namespaces and symbols, including
  nested modifiers such as `arrow.r.long`.
- Added built-in function signature completion for parameter names, accepted
  value types, literal enums, and named arguments.
- Added scope-aware completion for local variables, functions, parameters,
  destructured bindings, and `for` loop bindings.
- Added automatic indentation for blocks, calls, collections, parameters,
  math arguments, and nested list content.
- Added Typst-aware Enter and Shift-Enter behavior for creating, splitting,
  continuing, exiting, and outdenting list items.
- Added code folding for blocks, calls, collections, math, raw blocks, block
  comments, imports, nested list items, and hierarchical heading sections.
- Added parser, highlighting, completion, indentation, list-editing, folding,
  and incremental-update test coverage.
- Added GitHub Actions CI and tag-based npm trusted publishing with provenance.

### Changed

- Updated syntax highlighting to follow the official Typst web app's tag
  mapping and light-theme colors.

[Unreleased]: https://github.com/kxxt/codemirror-lang-typst/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/kxxt/codemirror-lang-typst/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/kxxt/codemirror-lang-typst/compare/f6aaca4...v0.5.0
