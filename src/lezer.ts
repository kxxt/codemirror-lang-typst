import {
    Language,
    LanguageSupport,
    defaultHighlightStyle,
    defineLanguageFacet,
    languageDataProp,
    syntaxHighlighting,
} from "@codemirror/language"
import {styleTags, tags} from "@lezer/highlight"
import {TypstHighlightSytle, typstLanguageDataConfig} from "./config"
import {typstCompletionSource} from "./complete"
import {typstLezerFolding, typstLezerFoldService} from "./fold"
import {typstTags} from "./highlight"
import {typstLezerIndentation, typstLezerIndentService} from "./indent"
import {typstLezerListKeymap} from "./list"
import {typstLezerLinter} from "./lint"
import {TypstLezerParser} from "./parser"

/** Language data used by the Lezer implementation, including completions. */
export const typstLezerLanguageData = defineLanguageFacet({
    ...typstLanguageDataConfig,
    autocomplete: typstCompletionSource,
    indentOnInput: /^\s*(?:[)\]}⟩⌉⌋❩❫❭❯❱❳⟧⟭⦄⦆⦈⦊⦌⦎⦐⦒⦘]|\|])$/,
})

/**
 * Lezer highlight metadata for the Typst concrete syntax tree.
 *
 * This deliberately contains no dependency on the WASM highlighter. The
 * selectors mirror `typst-syntax`'s highlight categories where those can be
 * represented through Lezer node props.
 */
export const typstLezerHighlighting = styleTags({
    "Shebang LineComment BlockComment": tags.comment,
    Error: tags.invalid,

    "Linebreak Escape Shorthand MathShorthand": tags.escape,
    "Strong/... Strong/Star": tags.strong,
    "Emph/... Emph/Underscore": tags.emphasis,
    "Raw/...": tags.monospace,
    Link: tags.link,
    Label: tags.escape,
    "Ref/...": tags.escape,
    "Heading/...": tags.heading,
    "ListMarker EnumMarker TermMarker": typstTags.listMarker,

    Dollar: typstTags.mathDelimiter,
    "MathAlignPoint MathPrimes Root MathAttach/Underscore MathAttach/Hat MathFrac/Slash": tags.escape,
    "Math/LeftParen Math/RightParen": tags.paren,
    MathIdent: typstTags.interpolated,

    "Not And Or None Auto Let Set Show Context If Else For In While Break Continue Return Import Include As": tags.keyword,
    Bool: tags.bool,
    "Int Float Numeric": tags.number,
    Str: tags.string,

    "FuncCall/Ident MathCall/MathIdent SetRule/Ident ShowRule/Ident": tags.function(tags.variableName),
    "FieldAccess/Ident": tags.propertyName,
    Hash: typstTags.interpolated,

    "LeftBrace RightBrace LeftBracket RightBracket LeftParen RightParen Comma Semicolon Colon Dot": tags.punctuation,
    "Star Plus Minus Slash Eq EqEq ExclEq Lt LtEq Gt GtEq PlusEq HyphEq StarEq SlashEq Dots Arrow": tags.operator,
})

/**
 * Typst language support backed entirely by the native Lezer parser.
 * Includes syntax highlighting, autocomplete, indentation, folding, and linting.
 *
 * Import this from `codemirror-lang-typst/lezer` when the application should
 * not load or bundle the Typst WASM parser.
 */
export function typst_lezer(): LanguageSupport {
    const parser = new TypstLezerParser(
        languageDataProp.add(type => type.isTop ? typstLezerLanguageData : undefined),
        typstLezerHighlighting,
        typstLezerIndentation,
        typstLezerFolding,
    )
    return new LanguageSupport(new Language(typstLezerLanguageData, parser, [], "typst"), [
        syntaxHighlighting(TypstHighlightSytle),
        syntaxHighlighting(defaultHighlightStyle),
        typstLezerIndentService,
        typstLezerListKeymap,
        typstLezerFoldService,
        typstLezerLinter,
    ])
}

export {typstLezerLanguageData as typstLanguageData}
export {TypstHighlightSytle} from "./config"
export * from "./complete"
export * from "./fold"
export * from "./highlight"
export * from "./indent"
export * from "./list"
export * from "./lint"
export * from "./parser"
export type {TypstBuiltinParameter} from "./signatures"
