import ist from "ist"
import {EditorState} from "@codemirror/state"
import {foldable, foldService} from "@codemirror/language"
import {typst_lezer} from "../dist/lezer.js"

function state(doc) {
    return EditorState.create({doc, extensions: [typst_lezer()]})
}

function foldedText(doc, lineNumber = 1) {
    const editor = state(doc)
    const line = editor.doc.line(lineNumber)
    const range = foldable(editor, line.from, line.to)
    return range && editor.sliceDoc(range.from, range.to)
}

describe("Typst Lezer code folding", () => {
    it("folds code, content, call, and collection bodies", () => {
        ist(foldedText("#{\n  let x = 1\n}"), "\n  let x = 1\n")
        ist(foldedText("#[\ncontent\n]"), "\ncontent\n")
        ist(foldedText("#strike(\n  stroke: red,\n  offset: 1pt,\n)"),
            "\n  stroke: red,\n  offset: 1pt,\n")
        ist(foldedText("#let values = (\n  1,\n  2,\n)"), "\n  1,\n  2,\n")
        ist(foldedText("#let f(\n  value,\n  named: 1,\n) = []"),
            "\n  value,\n  named: 1,\n")
    })

    it("folds math argument lists and math delimiters", () => {
        ist(foldedText("$ mat(\n1, 2;\n3, 4\n) $"), "\n1, 2;\n3, 4\n")
        ist(foldedText("$ ⟨\nx\n⟩ $"), "\nx\n")
    })

    it("folds fenced raw blocks and block comments without hiding closers", () => {
        ist(foldedText("```typ\nlet x = 1\n```"), "\nlet x = 1\n")
        ist(foldedText("/* first\n * second\n */"), "\n * second\n ")
        ist(foldedText("`raw`"), null)
        ist(foldedText("/* one line */"), null)
    })

    it("folds multiline list item bodies", () => {
        const doc = "- parent\n  continuation\n  - child\n    child continuation\n\nafter"
        ist(foldedText(doc, 1), "\n  continuation\n  - child\n    child continuation")
        ist(foldedText(doc, 3), "\n    child continuation")
        ist(foldedText(doc, 6), null)
    })

    it("folds heading sections until a heading of the same or higher level", () => {
        const doc = "= One\ntext\n== Child\nchild\n= Two\ntext"
        ist(foldedText(doc, 1), "\ntext\n== Child\nchild")
        ist(foldedText(doc, 3), "\nchild")
        ist(foldedText(doc, 5), "\ntext")
        ist(foldedText("= Empty\n= Next\ntext"), null)
    })

    it("keeps nested heading folds inside their content block", () => {
        const doc = "#[\n= Inner\ntext\n== Child\nmore\n]\n= Outer\nout"
        ist(foldedText(doc, 2), "\ntext\n== Child\nmore")
        ist(foldedText(doc, 4), "\nmore")
        ist(foldedText(doc, 7), "\nout")
    })

    it("folds parenthesized imports and unfinished code constructs", () => {
        ist(foldedText("#import \"module.typ\": (\n  first,\n  second,\n)"),
            "\n  first,\n  second,\n")
        ist(foldedText("#{\nvalue"), "\nvalue")
        ist(foldedText("#strike(\nstroke: red,"), "\nstroke: red,")
    })

    it("registers its heading fold service through typst_lezer", () => {
        ist(state("").facet(foldService).length, 1)
    })
})
