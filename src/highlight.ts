import { styleTags, tags } from "@lezer/highlight"

export const typstHighlight = styleTags({
  "Shebang": tags.documentMeta,
  "LineComment BlockComment": tags.comment,

  "Text": tags.content,
  // "Space": typstTags["Space"],
  "Linebreak": tags.contentSeparator,
  // "ParBreak": typstTags["ParBreak"],
  "Escape": tags.escape,
  "Shorthand": tags.contentSeparator,
  "SmartQuote": tags.quote,
  "Strong/...": tags.strong,
  "Emph/...": tags.emphasis,
  "RawLang": tags.annotation,
  "RawDelim": tags.controlKeyword,
  "Raw": tags.monospace,
  // RawTrimmed
  "Link": tags.link,
  "Label": tags.labelName,
  "Ref/...": tags.labelName,
  "Heading/...": tags.heading,
  // HeadingMarker
  // "ListItem/...": tags.list,
  // "EnumItem/...": tags.list,
  "ListMarker": tags.list,
  "EnumMarker": tags.list,
  // "TermItem/...": tag,
  "TermMarker": tags.definitionOperator,
  // "Equation": typstTags["Equation"],

  // "Math": typstTags["Math"],
  "MathText": tags.special(tags.string),
  "MathIdent": tags.special(tags.variableName),
  "MathShorthand MathAlignPoint MathDelimited MathAttach MathPrimes MathFrac MathRoot": tags.special(tags.contentSeparator),

  "Error": tags.invalid,

  "Hash": tags.controlKeyword,
  "LeftBrace RightBrace": tags.brace,
  "LeftBracket RightBracket": tags.bracket,
  "LeftParen RightParen": tags.paren,
  "Comma": tags.separator,
  "Semicolon Colon Dot Dots": tags.punctuation,
  // "Star" : TODO:
  // Underscore
  "Dollar": tags.controlKeyword,
  "Plus Minus Slash Hat": tags.arithmeticOperator,
  "Prime": tags.typeOperator,
  "Eq PlusEq HyphEq SlashEq StarEq": tags.updateOperator,
  "EqEq ExclEq Lt LtEq Gt GtEq": tags.compareOperator,
  "Arrow": tags.controlOperator,
  "Root": tags.arithmeticOperator,

  "Not And Or": tags.operatorKeyword,
  "None Auto": tags.literal,
  "If Else For While Break Continue Return": tags.controlKeyword,
  "Import Include": tags.moduleKeyword,
  "Let Set Show Context": tags.definitionKeyword,
  "As In": tags.operatorKeyword,

  "Code": tags.monospace,
  "Ident": tags.variableName,
  "Bool": tags.bool,
  "Int": tags.integer,
  "Float": tags.float,
  "Numeric": tags.number,
  "Str": tags.string,
  // CodeBlock
  // ContentBlock
  // Parenthesized
  // Array
  // Dict
  // Named
  // Keyed
  // Unary
  // Binary
  // FieldAccess
  // FuncCall
  // Args
  // Spread
  // Closure
  // Params
  // LetBinding
  // SetRule
  // ShowRule
  // Contextual
  // Conditional
  // WhileLoop
  // ForLoop
  // ModuleImport
  // ImportItems
  // ImportItemPath
  // RenamedImportItem
  // ModuleInclude
  // LoopBreak
  // LoopContinue
  // FuncReturn
  // Destructuring
  // DestructAssignment
})
