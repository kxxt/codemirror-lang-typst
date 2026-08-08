import {
    foldNodeProp,
    foldService,
    syntaxTree,
} from "@codemirror/language"
import type {EditorState} from "@codemirror/state"
import type {SyntaxNode} from "@lezer/common"

type FoldRange = {from: number, to: number}

function multilineRange(
    state: EditorState,
    from: number,
    to: number,
): FoldRange | null {
    if (from >= to || state.doc.lineAt(from).number === state.doc.lineAt(to).number) {
        return null
    }
    return {from, to}
}

function foldDelimited(node: SyntaxNode, state: EditorState): FoldRange | null {
    const first = node.firstChild
    const last = node.lastChild
    if (!first || !last) return null

    const expectedClosing = node.name === "CodeBlock" ? "RightBrace"
        : node.name === "ContentBlock" ? "RightBracket"
            : "RightParen"
    const closed = node.name === "MathDelimited" || last.name === expectedClosing
    return multilineRange(state, first.to, closed ? last.from : node.to)
}

function foldRaw(node: SyntaxNode, state: EditorState): FoldRange | null {
    const opening = node.firstChild
    const closing = node.lastChild
    if (!opening || opening.name !== "RawDelim") return null
    const firstLine = state.doc.lineAt(node.from)
    const closed = closing !== opening && closing?.name === "RawDelim"
    return multilineRange(state, firstLine.to, closed ? closing.from : node.to)
}

function foldBlockComment(node: SyntaxNode, state: EditorState): FoldRange | null {
    const firstLine = state.doc.lineAt(node.from)
    const closed = state.sliceDoc(Math.max(node.from, node.to - 2), node.to) === "*/"
    return multilineRange(state, firstLine.to, closed ? node.to - 2 : node.to)
}

function foldListItem(node: SyntaxNode, state: EditorState): FoldRange | null {
    const firstLine = state.doc.lineAt(node.from)
    return multilineRange(state, firstLine.to, node.to)
}

function foldModuleImport(node: SyntaxNode, state: EditorState): FoldRange | null {
    const opening = node.getChild("LeftParen")
    if (!opening) return null
    const closing = node.getChild("RightParen", "LeftParen")
    return multilineRange(state, opening.to, closing ? closing.from : node.to)
}

/** Native-Lezer folding metadata for structured Typst syntax nodes. */
export const typstLezerFolding = foldNodeProp.add({
    ["CodeBlock ContentBlock Args MathArgs Array Dict Parenthesized Params " +
    "Destructuring MathDelimited"]: foldDelimited,
    ModuleImport: foldModuleImport,
    Raw: foldRaw,
    BlockComment: foldBlockComment,
    "ListItem EnumItem TermItem": foldListItem,
})

function headingAtLine(
    state: EditorState,
    lineStart: number,
    lineEnd: number,
): SyntaxNode | null {
    const tree = syntaxTree(state)
    for (const start of [lineStart, lineEnd]) {
        let node: SyntaxNode | null = tree.resolveInner(start, start === lineStart ? 1 : -1)
        while (node && node.name !== "Heading") node = node.parent
        if (node && node.from >= lineStart && node.from <= lineEnd) return node
    }
    return null
}

function headingLevel(heading: SyntaxNode): number {
    const marker = heading.getChild("HeadingMarker")
    return marker ? marker.to - marker.from : 0
}

function foldEndBeforeBoundary(state: EditorState, boundary: number): number {
    if (boundary >= state.doc.length) return state.doc.length
    const line = state.doc.lineAt(boundary)
    return boundary === line.from && boundary > 0
        ? state.doc.lineAt(boundary - 1).to
        : boundary
}

function foldHeadingSection(
    state: EditorState,
    lineStart: number,
    lineEnd: number,
): FoldRange | null {
    const heading = headingAtLine(state, lineStart, lineEnd)
    const parent = heading?.parent
    if (!heading || !parent) return null

    const level = headingLevel(heading)
    let boundary = parent.to
    for (let sibling = heading.nextSibling; sibling; sibling = sibling.nextSibling) {
        if (sibling.name === "Heading" && headingLevel(sibling) <= level) {
            boundary = sibling.from
            break
        }
    }

    const to = foldEndBeforeBoundary(state, boundary)
    if (to <= lineEnd || !state.sliceDoc(lineEnd, to).trim()) return null
    return {from: lineEnd, to}
}

/** Heading-section folding service installed only by {@link typst_lezer}. */
export const typstLezerFoldService = foldService.of(foldHeadingSection)
