import { Tag, tags } from "@lezer/highlight"

export const typstTags = {
  mathDelimiter: Tag.define(tags.contentSeparator),
  mathOperator: Tag.define(tags.operator),
  listMarker: Tag.define(tags.list),
  interpolated: Tag.define(tags.variableName),
}

export const typstHighlightTag: {[name: string]: Tag} = {
  "typ-comment": tags.comment,
  "typ-punct": tags.punctuation,
  "typ-escape": tags.escape,
  "typ-strong": tags.strong,
  "typ-emph": tags.emphasis,
  "typ-link": tags.link,
  "typ-raw": tags.monospace,
  "typ-label": tags.labelName,
  "typ-ref": tags.labelName,
  "typ-heading": tags.heading,
  "typ-marker": typstTags.listMarker,
  "typ-term": tags.strong,
  "typ-math-delim": typstTags.mathDelimiter,
  "typ-math-op": typstTags.mathOperator,
  "typ-math-group": tags.paren,
  "typ-key": tags.keyword,
  "typ-op": tags.operator,
  "typ-num": tags.number,
  "typ-str": tags.string,
  "typ-func": tags.function(tags.variableName),
  "typ-pol": typstTags.interpolated,
  "typ-error": tags.invalid,
}
