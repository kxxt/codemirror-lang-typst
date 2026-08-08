import ist from "ist"
import {EditorSelection, EditorState} from "@codemirror/state"
import {indentUnit} from "@codemirror/language"
import {keymap} from "@codemirror/view"
import {
    insertNewTypstListItem,
    insertTypstListContinuation,
    typst_lezer,
} from "../dist/lezer.js"

function run(command, doc, anchor = doc.length, selection = null) {
    const extensions = [typst_lezer(), indentUnit.of("  ")]
    if (selection) extensions.push(EditorState.allowMultipleSelections.of(true))
    let editor = EditorState.create({
        doc,
        selection: selection ?? {anchor},
        extensions,
    })
    const view = {
        get state() { return editor },
        dispatch(spec) { editor = editor.update(spec).state },
    }
    return {handled: command(view), state: () => editor}
}

function apply(command, doc, anchor = doc.length) {
    const result = run(command, doc, anchor)
    return {
        handled: result.handled,
        doc: result.state().doc.toString(),
        cursor: result.state().selection.main.head,
    }
}

describe("Typst Lezer list editing", () => {
    it("creates a sibling item on Enter", () => {
        ist(apply(insertNewTypstListItem, "- item").doc, "- item\n- ")
        ist(apply(insertNewTypstListItem, "+ item").doc, "+ item\n+ ")
        ist(apply(insertNewTypstListItem, "/ term: description").doc,
            "/ term: description\n/ ")
        ist(apply(insertNewTypstListItem, "  - nested").doc, "  - nested\n  - ")
    })

    it("increments explicit numbered markers", () => {
        const result = apply(insertNewTypstListItem, "3. item")
        ist(result.doc, "3. item\n4. ")
        ist(result.cursor, result.doc.length)
    })

    it("creates a sibling after a continuation line", () => {
        const result = apply(insertNewTypstListItem, "- item\n  continuation")
        ist(result.doc, "- item\n  continuation\n- ")
    })

    it("splits a list item at the cursor", () => {
        const spaced = apply(insertNewTypstListItem, "- hello world", 7)
        ist(spaced.doc, "- hello\n- world")
        ist(spaced.doc.slice(0, spaced.cursor), "- hello\n- ")

        const word = apply(insertNewTypstListItem, "- hello world", 4)
        ist(word.doc, "- he\n- llo world")
        ist(word.doc.slice(0, word.cursor), "- he\n- ")

        const nested = apply(insertNewTypstListItem, "  - hello world", 9)
        ist(nested.doc, "  - hello\n  - world")
        ist(nested.doc.slice(0, nested.cursor), "  - hello\n  - ")

        const numbered = apply(insertNewTypstListItem, "3. alpha beta", 8)
        ist(numbered.doc, "3. alpha\n4. beta")
        ist(numbered.doc.slice(0, numbered.cursor), "3. alpha\n4. ")
    })

    it("splits a continuation line into a sibling item", () => {
        const doc = "- first\n  second half"
        const result = apply(insertNewTypstListItem, doc, doc.indexOf(" half"))
        ist(result.doc, "- first\n  second\n- half")
        ist(result.doc.slice(0, result.cursor), "- first\n  second\n- ")
    })

    it("continues the current item without a marker on Shift-Enter", () => {
        ist(apply(insertTypstListContinuation, "- item").doc, "- item\n  ")
        ist(apply(insertTypstListContinuation, "  - nested").doc, "  - nested\n    ")
        ist(apply(insertTypstListContinuation, "10. item").doc, "10. item\n    ")
        ist(apply(insertTypstListContinuation, "/ term: description").doc,
            "/ term: description\n  ")
        const split = apply(insertTypstListContinuation, "- hello world", 7)
        ist(split.doc, "- hello\n  world")
        ist(split.doc.slice(0, split.cursor), "- hello\n  ")
    })

    it("exits or outdents an empty list item", () => {
        ist(apply(insertNewTypstListItem, "- ").doc, "")
        ist(apply(insertNewTypstListItem, "- parent\n  - ").doc, "- parent\n- ")
    })

    it("falls through outside list content", () => {
        ist(apply(insertNewTypstListItem, "plain").handled, false)
        ist(apply(insertNewTypstListItem, "- item", 0).handled, false)
        ist(apply(insertTypstListContinuation, "plain").handled, false)
    })

    it("supports multiple cursors", () => {
        const selection = EditorSelection.create([
            EditorSelection.cursor(5),
            EditorSelection.cursor(11),
        ])
        const result = run(insertNewTypstListItem, "- one\n- two", 0, selection)
        ist(result.handled, true)
        ist(result.state().doc.toString(), "- one\n- \n- two\n- ")
        ist(result.state().selection.ranges.map(range => range.head).join(","), "8,17")
    })

    it("registers Enter and Shift-Enter with typst_lezer", () => {
        const editor = EditorState.create({doc: "- item", extensions: [typst_lezer()]})
        const binding = editor.facet(keymap).flat().find(item => item.key === "Enter" && item.shift)
        ist(!!binding, true)
    })
})
