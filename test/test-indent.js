import ist from "ist"
import {EditorState} from "@codemirror/state"
import {getIndentation, indentRange, indentUnit} from "@codemirror/language"
import {typst_lezer} from "../dist/lezer.js"

function state(doc) {
    return EditorState.create({
        doc,
        extensions: [typst_lezer(), indentUnit.of("  ")],
    })
}

function indentation(marked, marker = "|") {
    const pos = marked.indexOf(marker)
    if (pos < 0) throw new RangeError("indentation fixture is missing its cursor marker")
    const doc = marked.slice(0, pos) + marked.slice(pos + marker.length)
    return getIndentation(state(doc), pos)
}

describe("Typst Lezer indentation", () => {
    it("indents code and content blocks and dedents their closers", () => {
        ist(indentation("#{\n|value\n}"), 2)
        ist(indentation("#{\n  value\n|}"), 0)
        ist(indentation("#[\n|content\n]"), 2)
        ist(indentation("#[\n  content\n|]"), 0)
    })

    it("indents immediately after unfinished opening delimiters", () => {
        ist(indentation("#{\n|"), 2)
        ist(indentation("#[\n|"), 2)
        ist(indentation("#strike(\n|"), 2)
        ist(indentation("#let values = (\n|"), 2)
        ist(indentation("#let f(\n|"), 2)
        ist(indentation("$ mat(\n|"), 2)
        ist(indentation("#strike(first,\n|"), 8)
        ist(indentation("#strike()\n|"), 0)
    })

    it("indents multiline calls, arrays, dictionaries, and parameters", () => {
        ist(indentation("#strike(\n|stroke: red,\n)"), 2)
        ist(indentation("#let values = (\n|1,\n2,\n)"), 2)
        ist(indentation("#let values = (:\n|key: value,\n)"), 2)
        ist(indentation("#let f(\n|value,\nnamed: 1,\n) = []"), 2)
        ist(indentation("#strike(\n  stroke: red,\n|)"), 0)
    })

    it("aligns continuations when the first argument follows the opener", () => {
        ist(indentation("#strike(stroke: red,\n|offset: 1pt)"), 8)
        ist(indentation("#strike(stroke: red,\n        offset: 1pt\n|)"), 7)
    })

    it("uses the opening line indentation for nested delimiters", () => {
        ist(indentation("#{\n  let values = (\n|1,\n  )\n}"), 4)
        ist(indentation("#{\n  let values = (\n    1,\n|  )\n}"), 2)
    })

    it("indents math arguments", () => {
        ist(indentation("$ mat(\n|1, 2;\n3, 4\n) $"), 2)
        ist(indentation("$ mat(\n  1, 2;\n|) $"), 0)
        ist(indentation("$ ⟨\n|x\n⟩ $"), 2)
        ist(indentation("$ [|\n  x\n¦|] $", "¦"), 0)
    })

    it("indents list continuations but not the following blank paragraph", () => {
        ist(indentation("- item\n  |continuation"), 2)
        ist(indentation("/ term: description\n  |continued"), 2)
        ist(indentation("+ item\n|"), 0)
        ist(indentation("- parent\n  - child\n|"), 0)
        ist(indentation("- item\n\n|"), 0)
        ist(indentation("- item\n\n|text"), 0)
        ist(indentation("- item\n\n|  text"), 0)
        ist(indentation("#[\n  - item\n|\n]"), 2)
        ist(indentation("#[\n  - item\n\n|  text\n]"), 2)
    })

    it("provides closing-delimiter indentation-on-input rules", () => {
        const editor = state("#{\n  value\n}")
        const rules = editor.languageDataAt("indentOnInput", editor.doc.length)
        ist(rules.length, 1)
        ist(rules[0].test("  }"), true)
        ist(rules[0].test("  ]"), true)
        ist(rules[0].test("  )"), true)
        ist(rules[0].test("  ⟩"), true)
        ist(rules[0].test("  |]"), true)
        ist(rules[0].test("value"), false)
    })

    it("reindents complete ranges", () => {
        const editor = state("#strike(\nstroke: red,\noffset: 1pt,\n)")
        const formatted = indentRange(editor, 0, editor.doc.length).apply(editor.doc).toString()
        ist(formatted, "#strike(\n  stroke: red,\n  offset: 1pt,\n)")
    })
})
