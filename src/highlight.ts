import { styleTags, tags, Tag } from "@lezer/highlight"

export const typstTags = {
  Shebang: Tag.define(),
  RawLang: Tag.define(),
  ListMarker: Tag.define(),
  EnumMarker: Tag.define(),
  LineBreak: Tag.define(),
  Ref: Tag.define(),
  RefMarker: Tag.define(),
  TermMarker: Tag.define(),
  TermItem: Tag.define(),
  Equation: Tag.define(),
  MathText: Tag.define(),
  MathIdent: Tag.define(),
  MathShorthand: Tag.define(),
  MathAlignPoint: Tag.define(),
  MathDelimited: Tag.define(),
  MathAttach: Tag.define(),
  MathPrimes: Tag.define(),
  MathFrac: Tag.define(),
  MathRoot: Tag.define(),
};

export const typstHighlight = styleTags({
  "Shebang": typstTags["Shebang"],
  "LineComment BlockComment": tags.comment,

  "Text": tags.content,
  // "Space": typstTags["Space"],
  "LineBreak": typstTags["LineBreak"],
  // "ParBreak": typstTags["ParBreak"],
  "Escape": tags.escape,
  "Shorthand": tags.contentSeparator,
  "SmartQuote": tags.quote,
  "Strong/...": tags.strong,
  "Emph/...": tags.emphasis,
  "RawLang": typstTags["RawLang"],
  "RawDelim": tags.controlKeyword,
  "Raw": tags.monospace,
  // RawTrimmed
  "Link": tags.link,
  "Label": tags.labelName,
  "Ref": typstTags["Ref"],
  "RefMarker": typstTags["RefMarker"],
  "Heading/...": tags.heading,
  // HeadingMarker
  "ListItem/...": tags.list,
  "EnumItem/...": tags.list,
  "ListMarker": typstTags["ListMarker"],
  "EnumMarker": typstTags["EnumMarker"],
  "TermItem/...": typstTags["TermItem"],
  "TermMarker": typstTags["TermMarker"],
  "Equation": typstTags["Equation"],

  // "Math": typstTags["Math"],
  "MathText": typstTags["MathText"],
  "MathIdent": typstTags["MathIdent"],
  "MathShorthand": typstTags["MathShorthand"],
  "MathAlignPoint": typstTags["MathAlignPoint"],
  "MathDelimited": typstTags["MathDelimited"],
  "MathAttach": typstTags["MathAttach"],
  "MathPrimes": typstTags["MathPrimes"],
  "MathFrac": typstTags["MathFrac"],
  "MathRoot": typstTags["MathRoot"],

  "Hash": tags.processingInstruction,
  "LeftBrace RightBrace": tags.brace,
  "LeftBracket RightBracket": tags.bracket,
  "LeftParen RightParen": tags.paren,
  "Comma": tags.separator,
  "Semicolon Colon Dot Dots": tags.punctuation,
  // "Star" : TODO:
  // Underscore
  "Dollar": tags.processingInstruction,
  "Plus Minus Slash Hat": tags.arithmeticOperator,
  "Prime": tags.annotation,
  "Eq PlusEq HyphEq SlashEq StarEq": tags.updateOperator,
  "EqEq ExclEq Lt LtEq Gt GtEq": tags.compareOperator,
  "Arrow": tags.controlOperator,
  "Root": typstTags["MathRoot"],

  "Not And Or": tags.bitwiseOperator,
  "None Auto": tags.literal,
  "If Else For While Break Continue Return": tags.controlKeyword,
  "Import Include": tags.moduleKeyword,
  "Let Set Show Context": tags.definitionKeyword,
  "As In": tags.operatorKeyword,

  "Code": tags.monospace,
  "Ident": tags.name,
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
