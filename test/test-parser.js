import ist from "ist"
import {TreeFragment} from "@lezer/common"
import {highlightTree, tagHighlighter, tags} from "@lezer/highlight"
import {
    typst_lezer,
    typstParser,
    typstSyntaxKinds,
    typstTags,
} from "../dist/lezer.js"

describe("Typst Lezer parser", () => {
    it("parses markup constructs", () => {
        const tree = typstParser.parse("= Hello *strong* and _emph_\n- item\n@ref[body] <label>")
        ist(
            tree.toString(),
            "Typst(Heading(HeadingMarker,Space,Markup(Text,Space,Strong(Star,Markup(Text),Star),Space,Text,Space,Emph(Underscore,Markup(Text),Underscore))),Space,ListItem(ListMarker,Space,Markup(Text)),Space,Ref(RefMarker,ContentBlock(LeftBracket,Markup(Text),RightBracket)),Space,Label)",
        )
    })

    it("parses code and math modes", () => {
        const tree = typstParser.parse(
            "#let f(x, y: 1) = { x + y }\n#if true [yes] else [no]\n$sum_(i=1)^n i$",
        ).toString()
        for (const name of [
            "LetBinding", "Closure", "Params", "Named", "CodeBlock", "Binary",
            "Conditional", "ContentBlock", "Equation", "MathAttach",
        ]) ist(tree.includes(name), true)
    })

    it("keeps trivia, raw parts, and comments in the CST", () => {
        const tree = typstParser.parse("/* outer /* nested */ */\n```typ\n  code\n```\n").toString()
        ist(tree.includes("BlockComment"), true)
        ist(tree.includes("RawDelim"), true)
        ist(tree.includes("RawLang"), true)
        ist(tree.includes("RawTrimmed"), true)
    })

    it("uses Lezer node props for syntax highlighting", () => {
        const doc = "= Head\n#let x = 12\n`raw` $x^2$ // hi"
        const tree = typst_lezer().language.parser.parse(doc)
        const highlighter = tagHighlighter([
            {tag: tags.heading, class: "heading"},
            {tag: tags.keyword, class: "keyword"},
            {tag: tags.number, class: "number"},
            {tag: tags.monospace, class: "raw"},
            {tag: typstTags.mathDelimiter, class: "math-delimiter"},
            {tag: tags.comment, class: "comment"},
        ])
        const highlighted = []
        highlightTree(tree, highlighter, (from, to, classes) => {
            highlighted.push([doc.slice(from, to), classes])
        })
        ist(highlighted.some(([text, cls]) => text === "= Head" && cls === "heading"), true)
        ist(highlighted.some(([text, cls]) => text === "let" && cls === "keyword"), true)
        ist(highlighted.some(([text, cls]) => text === "12" && cls === "number"), true)
        ist(highlighted.some(([text, cls]) => text === "`raw`" && cls === "raw"), true)
        ist(highlighted.filter(([text, cls]) => text === "$" && cls === "math-delimiter").length, 2)
        ist(highlighted.some(([text, cls]) => text === "// hi" && cls === "comment"), true)
    })

    it("uses UTF-16 positions", () => {
        const doc = "😀 #let x = 1"
        const tree = typstParser.parse(doc)
        ist(tree.length, doc.length)
        const ident = tree.topNode.getChild("LetBinding").getChild("Ident")
        ist(ident.from, 8)
        ist(ident.to, 9)
    })

    it("recovers from incomplete input", () => {
        const doc = "#let f(x = { $x^"
        const tree = typstParser.parse(doc)
        ist(tree.length, doc.length)
        ist(tree.toString().includes("Error"), true)
    })

    it("accepts Lezer fragments and produces the fresh tree", () => {
        const before = "= Heading\n#let x = 1\n"
        const after = "= Longer heading\n#let x = 2\n"
        const oldTree = typstParser.parse(before)
        const fragments = TreeFragment.applyChanges(TreeFragment.addTree(oldTree), [
            {fromA: 2, toA: 9, fromB: 2, toB: 16},
            {fromA: 19, toA: 20, fromB: 26, toB: 27},
        ])
        ist(
            typstParser.parse(after, fragments).toString(),
            typstParser.parse(after).toString(),
        )
    })

    it("supports ranged and stopped parses", () => {
        const doc = "ignored #let x = 1 ignored"
        const ranged = typstParser.parse(doc, [], [{from: 8, to: 18}])
        ist(ranged.length, 10)
        ist(ranged.toString().includes("LetBinding"), true)

        const partial = typstParser.startParse("= Heading\nrest")
        partial.stopAt(9)
        const stopped = partial.advance()
        ist(stopped.length, 9)
        ist(stopped.toString().includes("Heading"), true)
    })

    it("publishes the Typst 0.15 syntax-kind vocabulary", () => {
        ist(typstSyntaxKinds[0], "End")
        ist(typstSyntaxKinds.includes("MathRoot"), true)
        ist(typstSyntaxKinds.includes("DestructAssignment"), true)
    })
})
