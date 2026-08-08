import {EditorSelection, Prec, type EditorState, type SelectionRange} from "@codemirror/state"
import {
    getIndentUnit,
    indentString,
    IndentContext,
    syntaxTree,
} from "@codemirror/language"
import {keymap, type Command} from "@codemirror/view"
import type {SyntaxNode} from "@lezer/common"

const listNodes = new Set(["ListItem", "EnumItem", "TermItem"])

type ListContext = {
    item: SyntaxNode,
    marker: SyntaxNode,
}

type ListEdit = {
    from: number,
    to: number,
    insert: string,
}

function listContextAt(state: EditorState, pos: number): ListContext | null {
    const line = state.doc.lineAt(pos)
    let probe = pos
    while (probe > line.from && /[\t ]/u.test(state.sliceDoc(probe - 1, probe))) probe--

    let item: SyntaxNode | null = syntaxTree(state).resolveInner(probe, -1)
    while (item && !listNodes.has(item.name)) item = item.parent
    if (!item) return null

    const markerName = item.name === "ListItem"
        ? "ListMarker"
        : item.name === "EnumItem" ? "EnumMarker" : "TermMarker"
    const marker = item.getChild(markerName)
    return marker ? {item, marker} : null
}

function nextMarker(marker: string): string {
    const numbered = /^(\d+)\.$/u.exec(marker)
    return numbered ? `${BigInt(numbered[1]) + 1n}.` : marker
}

function parentListContext(item: SyntaxNode): ListContext | null {
    for (let parent = item.parent; parent; parent = parent.parent) {
        if (!listNodes.has(parent.name)) continue
        const markerName = parent.name === "ListItem"
            ? "ListMarker"
            : parent.name === "EnumItem" ? "EnumMarker" : "TermMarker"
        const marker = parent.getChild(markerName)
        return marker ? {item: parent, marker} : null
    }
    return null
}

function listEdit(
    state: EditorState,
    range: SelectionRange,
    continuation: boolean,
): ListEdit | null {
    if (!range.empty) return null
    const pos = range.head
    const line = state.doc.lineAt(pos)

    const context = listContextAt(state, pos)
    if (!context || (context.item.to < pos && state.sliceDoc(context.item.to, pos).trim())) {
        return null
    }
    if (line.from === state.doc.lineAt(context.marker.from).from && pos < context.marker.to) {
        return null
    }

    const markerText = state.sliceDoc(context.marker.from, context.marker.to)
    const markerLine = state.doc.lineAt(context.marker.from)
    const linePrefix = state.sliceDoc(markerLine.from, context.marker.from)
    if (!/^[\t ]*$/u.test(linePrefix)) return null

    // Avoid trailing whitespace on the old line and doubled whitespace after
    // the inserted marker when splitting between words.
    let splitFrom = pos, splitTo = pos
    while (splitFrom > line.from && /[\t ]/u.test(state.sliceDoc(splitFrom - 1, splitFrom))) {
        splitFrom--
    }
    while (splitTo < line.to && /[\t ]/u.test(state.sliceDoc(splitTo, splitTo + 1))) {
        splitTo++
    }

    if (continuation) {
        let contentStart = context.marker.to
        while (contentStart < line.to && /[\t ]/u.test(state.sliceDoc(contentStart, contentStart + 1))) {
            contentStart++
        }
        const indentContext = new IndentContext(state)
        const columns = contentStart > context.marker.to
            ? indentContext.column(contentStart)
            : indentContext.column(context.marker.to) + 1
        const insert = state.lineBreak + indentString(state, Math.max(
            columns,
            indentContext.column(context.marker.from) + getIndentUnit(state),
        ))
        return {from: splitFrom, to: splitTo, insert}
    }

    const itemContent = state.sliceDoc(context.marker.to, context.item.to).trim()
    if (!itemContent) {
        const parent = parentListContext(context.item)
        if (!parent) {
            return {from: line.from, to: pos, insert: ""}
        }

        const parentLine = state.doc.lineAt(parent.marker.from)
        const parentPrefix = state.sliceDoc(parentLine.from, parent.marker.from)
        const parentMarker = nextMarker(state.sliceDoc(parent.marker.from, parent.marker.to))
        const insert = `${parentPrefix}${parentMarker} `
        return {from: line.from, to: pos, insert}
    }

    const marker = nextMarker(markerText)
    const insert = `${state.lineBreak}${linePrefix}${marker} `
    return {from: splitFrom, to: splitTo, insert}
}

function editList(continuation: boolean): Command {
    return view => {
        const {state} = view
        const edits = state.selection.ranges.map(range => listEdit(state, range, continuation))
        if (edits.some(edit => !edit)) return false

        const applicable = edits as ListEdit[]
        const changes = state.changes(applicable.map(edit => ({
            from: edit.from,
            to: edit.to,
            insert: edit.insert,
        })))
        const cursorPositions: number[] = []
        changes.iterChanges((_fromA, _toA, _fromB, toB) => {
            // `toB` is unambiguously the end of this edit's inserted marker
            // and indentation, even when the edit replaces split whitespace.
            cursorPositions.push(toB)
        }, true)
        const selection = EditorSelection.create(
            cursorPositions.map(pos => EditorSelection.cursor(pos)),
            state.selection.mainIndex,
        )
        view.dispatch({changes, selection, scrollIntoView: true, userEvent: "input"})
        return true
    }
}

/** Split the current Typst list item into a new sibling at the cursor. */
export const insertNewTypstListItem: Command = editList(false)

/** Insert an indented continuation line without creating another list item. */
export const insertTypstListContinuation: Command = editList(true)

/** Enter/Shift-Enter bindings installed only by {@link typst_lezer}. */
export const typstLezerListKeymap = Prec.high(keymap.of([{
    key: "Enter",
    run: insertNewTypstListItem,
    shift: insertTypstListContinuation,
}]))
