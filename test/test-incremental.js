import ist from "ist"
import {EditorState} from "@codemirror/state"
import {ensureSyntaxTree} from "@codemirror/language"
import {patchHighlights, typst, typst_lezer} from "../dist/index.js"
import {TypstWasmParser} from "../wasm/typst_syntax.js"

function applyEdits(doc, edits) {
    let result = "", position = 0
    for (const edit of edits) {
        result += doc.slice(position, edit.from) + edit.insert
        position = edit.to
    }
    return result + doc.slice(position)
}

function assertIncrementalMatchesFresh(doc, edits) {
    const updated = applyEdits(doc, edits)
    const parser = new TypstWasmParser(doc)
    parser.edit_many(edits)
    const fresh = new TypstWasmParser(updated)

    ist(parser.length(), updated.length)
    ist(
        JSON.stringify(Array.from(parser.highlight())),
        JSON.stringify(Array.from(fresh.highlight())),
    )
    ist(JSON.stringify(parser.tree()), JSON.stringify(fresh.tree()))
}

/// The set of highlight triples, ignoring order and duplicates, which is what
/// the decorations end up looking like.
function highlightSet(highlights) {
    const set = new Set()
    for (let i = 0; i < highlights.length; i += 3) {
        set.add(`${highlights[i]},${highlights[i + 1]},${highlights[i + 2]}`)
    }
    return JSON.stringify([...set].sort())
}

/// A minimal stand-in for `ChangeDesc.mapPos` that maps positions through the
/// given edits (which are relative to the pre-edit text).
function makeChangeMap(edits) {
    const sorted = [...edits].sort((a, b) => a.from - b.from)
    return {
        mapPos(pos, assoc = 1) {
            let p = pos
            for (const edit of sorted) {
                const delta = edit.insert.length - (edit.to - edit.from)
                if (edit.from < p || (edit.from === p && assoc > 0)) p += delta
            }
            return Math.max(0, p)
        },
    }
}

function assertIncrementalBufferMatchesFresh(doc, edits) {
    const updated = applyEdits(doc, edits)
    const parser = new TypstWasmParser(doc)
    const highlights = parser.highlight()
    const ranges = parser.edit_many(edits)
    const patched = patchHighlights(highlights, makeChangeMap(edits), ranges, parser)

    const fresh = new TypstWasmParser(updated)
    ist(highlightSet(patched), highlightSet(fresh.highlight()))
}

describe("Typst incremental highlighting", () => {
    it("handles multiple changes in one transaction", () => {
        const doc = "== Hello\nWorld\n\n== Why\nare\n\n= You\nhrere\n"
        const movedLine = "== Why\n"
        const from = doc.indexOf(movedLine)
        const insertAt = doc.indexOf("are\n") + "are\n".length

        assertIncrementalMatchesFresh(doc, [
            {from, to: from + movedLine.length, insert: ""},
            {from: insertAt, to: insertAt, insert: movedLine},
        ])
    })

    it("handles distant edits with different length deltas", () => {
        const doc = "= Heading\nplain text\n#let value = 1\n"
        assertIncrementalMatchesFresh(doc, [
            {from: 2, to: 9, insert: "A much longer heading"},
            {from: doc.indexOf("plain"), to: doc.indexOf("plain") + 5, insert: "*strong*"},
            {from: doc.lastIndexOf("1"), to: doc.lastIndexOf("1") + 1, insert: "22"},
        ])
        assertIncrementalBufferMatchesFresh(doc, [
            {from: 2, to: 9, insert: "A much longer heading"},
            {from: doc.indexOf("plain"), to: doc.indexOf("plain") + 5, insert: "*strong*"},
            {from: doc.lastIndexOf("1"), to: doc.lastIndexOf("1") + 1, insert: "22"},
        ])
    })

    it("patches the highlight buffer incrementally", () => {
        // A larger document with edits scattered across it.
        const doc = "= Heading\ntext\n\n= Subheading\nmore text\n\n#let value = 1\n"
        assertIncrementalBufferMatchesFresh(doc, [
            {from: 2, to: 9, insert: "A much longer heading"},
            {from: doc.indexOf("more"), to: doc.indexOf("more") + 4, insert: "*emph*"},
            {from: doc.lastIndexOf("1"), to: doc.lastIndexOf("1") + 1, insert: "22"},
        ])
    })

    it("patches the highlight buffer across sequential typing edits", () => {
        // Simulate typing character by character, patching the buffer after
        // each individual edit.
        const doc = "= Hello\n#let x = 1\nplain text\n"
        let parser = new TypstWasmParser(doc)
        let highlights = parser.highlight()
        let current = doc
        const positions = [3, 6, 12, 13, 19, 28, 28]
        for (const [i, pos] of positions.entries()) {
            const edits = [{from: pos, to: pos, insert: i % 2 ? "*" : "_"}]
            current = applyEdits(current, edits)
            const ranges = parser.edit_many(edits)
            highlights = patchHighlights(highlights, makeChangeMap(edits), ranges, parser)
            const fresh = new TypstWasmParser(current)
            ist(highlightSet(highlights), highlightSet(fresh.highlight()))
        }
    })

    it("uses UTF-16 positions without splitting surrogate pairs", () => {
        const doc = "😀 alpha\n#let x = 1\n😀 omega\n"
        const edits = [
            {from: 0, to: 2, insert: "😁"},
            {from: doc.lastIndexOf("😀"), to: doc.lastIndexOf("😀") + 2, insert: "😎"},
        ]
        assertIncrementalMatchesFresh(doc, edits)
        assertIncrementalBufferMatchesFresh(doc, edits)
    })

    it("returns compact highlight triples", () => {
        const parser = new TypstWasmParser("= Heading\n#let value = 1\n")
        const highlights = parser.highlight()
        ist(highlights instanceof Uint32Array)
        ist(highlights.length % 3, 0)
        for (let i = 0; i < highlights.length; i += 3) {
            ist(highlights[i] <= highlights[i + 1])
            ist(highlights[i + 1] <= parser.length())
            ist(highlights[i + 2] < TypstWasmParser.get_highlight_tags().length)
        }
    })

    it("exposes the parsed Typst tree through typst_lezer", () => {
        const editorState = EditorState.create({
            doc: "= Heading\n#let value = 1\n$ x^2 $\n",
            extensions: [typst_lezer()],
        })
        const tree = ensureSyntaxTree(editorState, editorState.doc.length, 1e9)
        ist(tree.type.name, "Typst")
        ist(tree.length, editorState.doc.length)
        ist(tree.toString().includes("Heading"), true)
        ist(tree.toString().includes("LetBinding"), true)
        ist(tree.toString().includes("Equation"), true)
    })

    it("keeps typst() on the legacy placeholder parser", () => {
        const doc = "= Heading\n" + "text\n".repeat(10_000)
        const editorState = EditorState.create({doc, extensions: [typst()]})
        const tree = ensureSyntaxTree(editorState, editorState.doc.length, 1e9)
        ist(tree.type.name, "Typst")
        ist(tree.length, doc.length)
        ist(tree.children.length, 0)
    })
})
