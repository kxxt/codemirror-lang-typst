import { tags } from '@lezer/highlight'
import { TypstParser } from './typst'
import {
    HighlightStyle,
    LanguageSupport,
    Language,
    defaultHighlightStyle,
    syntaxHighlighting,
    defineLanguageFacet,
    languageDataProp,
} from '@codemirror/language'
import { typstTags } from './highlight'
import { typstHighlighting } from './typst'

const data = defineLanguageFacet({ commentTokens: { block: { open: "/*", close: "*/" } } })

// The same highlight style as the official Typst web app
// (https://typst.app), using the app's light theme colors.
export const TypstHighlightSytle = HighlightStyle.define([
    { tag: tags.comment, color: "#74747c" },
    { tag: tags.monospace, color: "#6b6b6f" },
    { tag: typstTags.mathDelimiter, color: "#198810" },
    { tag: typstTags.listMarker, color: "#8b41b1" },
    { tag: tags.escape, color: "#1d6c76" },
    { tag: tags.labelName, color: "#1d6c76" },
    { tag: tags.keyword, color: "#d73948" },
    { tag: tags.null, color: "#d73948" },
    { tag: tags.atom, color: "#d73948" },
    { tag: tags.bool, color: "#d73948" },
    { tag: tags.number, color: "#b60157" },
    { tag: tags.string, color: "#198810" },
    { tag: tags.function(tags.variableName), color: "#4b69c6" },
    { tag: typstTags.interpolated, color: "#8b41b1" },
    { tag: tags.propertyName, color: "#8b41b1" },
])

export function typst(): LanguageSupport {
    let parser = new TypstParser(
        languageDataProp.add(type => type.isTop ? data : undefined),
    );
    return new LanguageSupport(new Language(data, parser, [], 'typst'), [
        syntaxHighlighting(TypstHighlightSytle),
        // Like the official app: headings, strong/emph, links and errors fall
        // back to CodeMirror's default style.
        syntaxHighlighting(defaultHighlightStyle),
        typstHighlighting,
    ])
}
