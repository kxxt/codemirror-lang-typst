import {TypstParser, typstHighlighting} from './typst'
import {
    LanguageSupport,
    Language,
    defaultHighlightStyle,
    syntaxHighlighting,
    languageDataProp,
} from '@codemirror/language'
import {TypstHighlightSytle, typstLanguageData} from './config'

export {TypstHighlightSytle} from './config'

export function typst(): LanguageSupport {
    const parser = new TypstParser(
        languageDataProp.add(type => type.isTop ? typstLanguageData : undefined),
    );
    return new LanguageSupport(new Language(typstLanguageData, parser, [], 'typst'), [
        syntaxHighlighting(TypstHighlightSytle),
        // Like the official app: headings, strong/emph, links and errors fall
        // back to CodeMirror's default style.
        syntaxHighlighting(defaultHighlightStyle),
        typstHighlighting,
    ])
}
