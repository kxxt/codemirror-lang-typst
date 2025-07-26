import { tags } from '@lezer/highlight'
import { TypstParser } from './typst'
import {
    HighlightStyle,
    LanguageSupport,
    Language,
    syntaxHighlighting,
    defineLanguageFacet,
} from '@codemirror/language'
import { typstHighlight, typstTags } from './highlight'
import type { Extension } from '@codemirror/state'

const data = defineLanguageFacet({ commentTokens: { block: { open: "/*", close: "*/" } } })

export const TypstHighlightSytle = HighlightStyle.define([
    { tag: tags.heading, color: "black", fontWeight: 'bold', textDecoration: 'underline' },
    { tag: typstTags.Shebang, color: "gray", fontStyle: "italic" },
    { tag: tags.comment, color: "green" },
    { tag: tags.processingInstruction, color: "fuchsia" },
    { tag: tags.controlKeyword, color: "#d73a49" },
    { tag: typstTags.RawLang, color: "brown", fontWeight: 'bold' },
    { tag: typstTags.ListMarker, color: "brown", fontWeight: 'bold' },
    { tag: typstTags.EnumMarker, color: "orange", fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.literal, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.controlKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.moduleKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.operatorKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.definitionKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: typstTags.MathText, color: 'blue' },
    { tag: typstTags.MathIdent, color: 'green' },
    { tag: typstTags.MathShorthand, color: 'red', fontWeight: 'bold' },
    { tag: typstTags.MathAlignPoint, color: 'black', fontWeight: 'bold' },
    { tag: typstTags.MathDelimited, color: 'teal', fontWeight: 'bold' },
    { tag: typstTags.MathAttach, color: 'tomato', fontWeight: 'bold' },
    { tag: typstTags.MathPrimes, color: 'gray', fontWeight: 'bold' },
    { tag: typstTags.MathFrac, color: 'tomato', fontWeight: 'bold' },
    { tag: typstTags.MathRoot, color: 'tomato', fontWeight: 'bold' },
    { tag: tags.name, color: "slateblue" },
    { tag: tags.brace, color: "hotpink" },
    { tag: tags.bracket, color: "blue" },
    { tag: tags.paren, color: "red" },
    { tag: tags.labelName, color: "purple" },
    { tag: tags.monospace, fontFamily: "monospace", },
])

export function typst(): [LanguageSupport, Extension] {
    let parser = new TypstParser(typstHighlight);
    let updateListener = parser.updateListener();
    return [new LanguageSupport(new Language(data, parser,
        [
            syntaxHighlighting(TypstHighlightSytle)
        ], 'typst')), updateListener]
}