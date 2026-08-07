import { Tag, tags } from "@lezer/highlight"

// Custom tags used by the Typst highlighter. Like in the official web app,
// they are defined without a base tag so that only the explicit style rules
// for them apply.
export const typstTags = {
  mathDelimiter: Tag.define(),
  listMarker: Tag.define(),
  interpolated: Tag.define(),
}

// Maps the CSS classes produced by typst-syntax's `Tag::css_class` to Lezer
// highlight tags, matching the official Typst web app's mapping.
export const typstHighlightTag: {[name: string]: Tag} = {
  "typ-comment": tags.comment,
  "typ-punct": tags.punctuation,
  "typ-escape": tags.escape,
  "typ-strong": tags.strong,
  "typ-emph": tags.emphasis,
  "typ-link": tags.link,
  "typ-raw": tags.monospace,
  "typ-label": tags.escape,
  "typ-ref": tags.escape,
  "typ-heading": tags.heading,
  "typ-marker": typstTags.listMarker,
  "typ-term": tags.strong,
  "typ-math-delim": typstTags.mathDelimiter,
  "typ-math-op": tags.escape,
  "typ-key": tags.keyword,
  "typ-op": tags.operator,
  "typ-num": tags.number,
  "typ-str": tags.string,
  "typ-func": tags.function(tags.variableName),
  "typ-pol": typstTags.interpolated,
  "typ-error": tags.invalid,
  // Added in Typst 0.15; not yet mapped by the official app.
  "typ-math-group": tags.paren,
}
