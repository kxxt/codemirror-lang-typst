import {
    Language,
    LanguageDescription,
    LanguageSupport,
    ParseContext,
    defaultHighlightStyle,
    defineLanguageFacet,
    languageDataProp,
    syntaxHighlighting,
} from "@codemirror/language"
import {
    type Input,
    type PartialParse,
    type TreeFragment,
    Parser,
    parseMixed,
} from "@lezer/common"
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

/** A language that may be selected for a fenced raw block. */
export type TypstCodeLanguage = Language | LanguageDescription

/** Resolve a Typst raw language tag, such as `js`, to a CodeMirror language. */
export type TypstCodeLanguageResolver = (name: string) => TypstCodeLanguage | null

/** Configuration for the native Lezer Typst language support. */
export interface TypstLezerConfig {
    /**
     * Languages available to fenced raw blocks. Arrays are matched against
     * the raw language tag with `LanguageDescription.matchLanguageName`.
     */
    codeLanguages?: readonly LanguageDescription[] | TypstCodeLanguageResolver,
    /**
     * Language used when a fenced raw block has no matching language tag.
     * When a `LanguageSupport` is given, its support extensions are included.
     */
    defaultCodeLanguage?: Language | LanguageSupport,
}

type CodeParser = (name: string) => Parser | null

function codeParser(
    languages: TypstLezerConfig["codeLanguages"],
    defaultLanguage: Language | null,
): CodeParser {
    return name => {
        let found: TypstCodeLanguage | null = null
        if (name && languages) {
            found = typeof languages === "function"
                ? languages(name)
                : LanguageDescription.matchLanguageName(languages, name, true)
        }
        if (found instanceof LanguageDescription) {
            return found.support
                ? found.support.language.parser
                : ParseContext.getSkippingParser(found.load())
        }
        return found ? found.parser : defaultLanguage?.parser ?? null
    }
}

class MixedTypstParser extends Parser {
    private readonly wrap

    constructor(readonly base: Parser, resolveCode: CodeParser) {
        super()
        this.wrap = parseMixed((node, input) => {
            if (node.name !== "Raw") return null
            const raw = node.node
            const opening = raw.firstChild
            if (!opening || opening.name !== "RawDelim" || opening.to - opening.from < 3) return null
            const language = raw.getChild("RawLang")
            const parser = resolveCode(language ? input.read(language.from, language.to) : "")
            if (!parser) return null
            const closing = raw.lastChild
            const from = language?.to ?? opening.to
            const to = closing?.name === "RawDelim" ? closing.from : raw.to
            return {parser, overlay: from < to ? [{from, to}] : []}
        })
    }

    createParse(
        input: Input,
        fragments: readonly TreeFragment[],
        ranges: readonly {from: number, to: number}[],
    ): PartialParse {
        return this.wrap(this.base.createParse(input, fragments, ranges), input, fragments, ranges)
    }
}

/**
 * Typst language support backed entirely by the native Lezer parser.
 * Includes syntax highlighting, autocomplete, indentation, folding, and linting.
 *
 * Import this from `codemirror-lang-typst/lezer` when the application should
 * not load or bundle the Typst WASM parser.
 */
export function typst_lezer(config: TypstLezerConfig = {}): LanguageSupport {
    const baseParser = new TypstLezerParser(
        languageDataProp.add(type => type.isTop ? typstLezerLanguageData : undefined),
        typstLezerHighlighting,
        typstLezerIndentation,
        typstLezerFolding,
    )
    const defaultLanguage = config.defaultCodeLanguage instanceof LanguageSupport
        ? config.defaultCodeLanguage.language
        : config.defaultCodeLanguage ?? null
    const parser = config.codeLanguages || defaultLanguage
        ? new MixedTypstParser(baseParser, codeParser(config.codeLanguages, defaultLanguage))
        : baseParser
    const support = [
        syntaxHighlighting(TypstHighlightSytle),
        syntaxHighlighting(defaultHighlightStyle),
        typstLezerIndentService,
        typstLezerListKeymap,
        typstLezerFoldService,
        typstLezerLinter,
    ]
    if (config.defaultCodeLanguage instanceof LanguageSupport) {
        support.push(config.defaultCodeLanguage.support)
    }
    return new LanguageSupport(new Language(typstLezerLanguageData, parser, [], "typst"), support)
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
