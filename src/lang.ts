import { tags } from '@lezer/highlight'
import { TypstParser } from './typst'
import {
    HighlightStyle,
    LanguageSupport,
    Language,
    syntaxHighlighting,
    defineLanguageFacet,
} from '@codemirror/language'
import { typstHighlight } from './highlight'

const data = defineLanguageFacet({ commentTokens: { block: { open: "/*", close: "*/" } } })

export const TypstHighlightSytle = HighlightStyle.define([
    { tag: tags.heading, color: "black", fontWeight: 'bold', textDecoration: 'underline' },
    { tag: tags.comment, color: "green" },
    { tag: tags.processingInstruction, color: "fuchsia" },
    { tag: tags.controlKeyword, color: "#d73a49" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.literal, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.controlKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.moduleKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.operatorKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.definitionKeyword, color: 'deeppink', fontWeight: 'bold' },
    { tag: tags.name, color: "slateblue" },
    { tag: tags.brace, color: "hotpink" },
    { tag: tags.bracket, color: "blue" },
    { tag: tags.paren, color: "red" },
    { tag: tags.labelName, color: "purple" },
    { tag: tags.monospace, fontFamily: "monospace", },
])

export function typst(): LanguageSupport {
    let parser = new TypstParser(typstHighlight);
    let updateListener = parser.updateListener();
    return new LanguageSupport(new Language(data, parser,
        [
            updateListener,
            syntaxHighlighting(TypstHighlightSytle)
        ], 'typst'))
}