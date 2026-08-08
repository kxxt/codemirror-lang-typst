import {HighlightStyle, defineLanguageFacet} from "@codemirror/language"
import {tags} from "@lezer/highlight"
import {typstTags} from "./highlight"

export const typstLanguageDataConfig = {
    commentTokens: {line: "//", block: {open: "/*", close: "*/"}},
} as const

export const typstLanguageData = defineLanguageFacet(typstLanguageDataConfig)

// The same highlight style as the official Typst web app
// (https://typst.app), using the app's light theme colors.
export const TypstHighlightSytle = HighlightStyle.define([
    {tag: tags.comment, color: "#74747c"},
    {tag: tags.monospace, color: "#6b6b6f"},
    {tag: typstTags.mathDelimiter, color: "#198810"},
    {tag: typstTags.listMarker, color: "#8b41b1"},
    {tag: tags.escape, color: "#1d6c76"},
    {tag: tags.labelName, color: "#1d6c76"},
    {tag: tags.keyword, color: "#d73948"},
    {tag: tags.null, color: "#d73948"},
    {tag: tags.atom, color: "#d73948"},
    {tag: tags.bool, color: "#d73948"},
    {tag: tags.number, color: "#b60157"},
    {tag: tags.string, color: "#198810"},
    {tag: tags.function(tags.variableName), color: "#4b69c6"},
    {tag: typstTags.interpolated, color: "#8b41b1"},
    {tag: tags.propertyName, color: "#8b41b1"},
])
