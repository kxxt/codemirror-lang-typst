import { tags } from '@lezer/highlight'
import { TypstParser } from './typst'
import {
    HighlightStyle,
    LanguageSupport,
    Language,
    syntaxHighlighting,
    defineLanguageFacet,
    languageDataProp,
} from '@codemirror/language'
import { typstTags } from './highlight'
import { typstHighlighting } from './typst'

const data = defineLanguageFacet({ commentTokens: { block: { open: "/*", close: "*/" } } })

export const TypstHighlightSytle = HighlightStyle.define([
    { tag: tags.heading, color: "black", fontWeight: 'bold', textDecoration: 'underline' },
    { tag: tags.comment, color: "green" },
    { tag: tags.punctuation, color: "fuchsia" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.literal, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.keyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.operator, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.name, color: "slateblue" },
    { tag: typstTags.mathDelimiter, color: "hotpink" },
    { tag: typstTags.mathOperator, color: "blue" },
    { tag: typstTags.listMarker, color: "red" },
    { tag: typstTags.interpolated, color: "slateblue" },
    { tag: tags.labelName, color: "purple" },
    { tag: tags.monospace, fontFamily: "monospace", },
    { tag: tags.invalid, color: "red" },
])

export function typst(): LanguageSupport {
    let parser = new TypstParser(
        languageDataProp.add(type => type.isTop ? data : undefined),
    );
    return new LanguageSupport(new Language(data, parser, [], 'typst'), [
        syntaxHighlighting(TypstHighlightSytle),
        typstHighlighting,
    ])
}
