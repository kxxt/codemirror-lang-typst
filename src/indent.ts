import {
    indentNodeProp,
    indentService,
    syntaxTree,
    type IndentContext,
    type TreeIndentContext,
} from "@codemirror/language"
import type {SyntaxNode} from "@lezer/common"

const triviaNodes = new Set([
    "Shebang", "LineComment", "BlockComment", "Space", "Parbreak",
])

const closingDelimiter: Readonly<Record<string, string>> = {
    "(": ")",
    "[": "]",
    "{": "}",
    "[|": "|]",
    "⟨": "⟩",
    "⌈": "⌉",
    "⌊": "⌋",
    "❨": "❩",
    "❪": "❫",
    "❬": "❭",
    "❮": "❯",
    "❰": "❱",
    "❲": "❳",
    "⟦": "⟧",
    "⟬": "⟭",
    "⦃": "⦄",
    "⦅": "⦆",
    "⦇": "⦈",
    "⦉": "⦊",
    "⦋": "⦌",
    "⦍": "⦎",
    "⦏": "⦐",
    "⦑": "⦒",
    "⦗": "⦘",
}

function firstNonTriviaAfter(opening: SyntaxNode): SyntaxNode | null {
    for (let node = opening.nextSibling; node; node = node.nextSibling) {
        if (!triviaNodes.has(node.name)) return node
    }
    return null
}

const alignedDelimitedNodes = new Set([
    "Args", "MathArgs", "Array", "Dict", "Parenthesized", "Params",
    "Destructuring", "MathDelimited",
])

const blockNodes = new Set(["CodeBlock", "ContentBlock"])

function delimiterFor(context: IndentContext, node: SyntaxNode): string | null {
    const prefix = context.state.sliceDoc(node.from, Math.min(node.from + 2, node.to))
    const opening = prefix.startsWith("[|") ? "[|" : prefix[0]
    return closingDelimiter[opening] ?? null
}

function delimiterIndentation(
    context: IndentContext,
    node: SyntaxNode,
    pos: number,
    align: boolean,
): number | null {
    const closing = delimiterFor(context, node)
    if (!closing) return null

    const after = context.textAfterPos(pos).trimStart()
    const closed = after.startsWith(closing)
    if (align) {
        const opening = node.firstChild
        let first = opening && firstNonTriviaAfter(opening)
        // `(:)` uses a colon immediately after the opener to mark an
        // empty/dictionary literal. It is syntax, not an item to align to.
        if (node.name === "Dict" && first?.name === "Colon") {
            first = firstNonTriviaAfter(first)
        }
        const simulatedBreak = context.simulatedBreak
        const openingLine = context.state.doc.lineAt(node.from)
        const lineEnd = simulatedBreak != null && simulatedBreak > openingLine.from &&
            simulatedBreak <= openingLine.to
            ? simulatedBreak
            : openingLine.to

        // Do not align to the closing token or to an item that starts on a
        // later line. In those cases a regular one-unit indent is clearer.
        if (opening && first &&
            context.state.sliceDoc(first.from, first.to) !== closing &&
            first.from < lineEnd) {
            return closed ? context.column(opening.from) : context.column(first.from)
        }
    }

    // Explicit Typst whitespace nodes can make TreeIndentContext.baseIndent
    // jump to an outer delimiter. The opening line's indentation is the
    // correct base and also honors IndentContext's range-indent overrides.
    return context.lineIndent(node.from) + (closed ? 0 : context.unit)
}

/**
 * Indent a delimited construct, optionally aligning continued lines with the
 * first item when that item starts on the opening delimiter's line.
 *
 * Typst's concrete tree retains whitespace nodes, unlike most generated Lezer
 * parsers, so CodeMirror's generic aligned-delimiter helper would treat a
 * newline as the first item. This variant deliberately skips Typst trivia.
 */
function delimitedIndent(align: boolean) {
    return (context: TreeIndentContext): number => {
        return delimiterIndentation(context, context.node, context.pos, align) ??
            context.continue() ?? context.lineIndent(context.node.from)
    }
}

const alignedDelimitedIndent = delimitedIndent(true)
const blockIndent = delimitedIndent(false)

function listItemIndent(context: TreeIndentContext): number {
    const itemLine = context.state.doc.lineAt(context.node.from)
    const markerColumn = context.column(context.node.from)
    const targetLine = context.state.doc.lineAt(context.pos)
    if (targetLine.from > 0) {
        const previous = context.state.doc.lineAt(targetLine.from - 1)
        if (!previous.text.trim()) return markerColumn
    }
    return context.pos <= itemLine.to ? markerColumn : markerColumn + context.unit
}

/** Native-Lezer indentation metadata for Typst syntax nodes. */
export const typstLezerIndentation = indentNodeProp.add({
    "CodeBlock ContentBlock": blockIndent,
    "Args MathArgs Array Dict Parenthesized Params Destructuring MathDelimited":
        alignedDelimitedIndent,
    "ListItem EnumItem TermItem": listItemIndent,
})

function delimitedAncestor(node: SyntaxNode | null): SyntaxNode | null {
    for (let current = node; current; current = current.parent) {
        if (alignedDelimitedNodes.has(current.name) || blockNodes.has(current.name)) {
            return current
        }
    }
    return null
}

function unfinishedDelimiterIndent(context: IndentContext, pos: number): number | undefined {
    const tree = syntaxTree(context.state)
    let delimiter = delimitedAncestor(tree.resolveInner(pos, -1))
    if (!delimiter) {
        let probe = pos
        while (probe > 0 && /\s/u.test(context.state.sliceDoc(probe - 1, probe))) probe--
        delimiter = delimitedAncestor(tree.resolveInner(probe, -1))
    }
    if (!delimiter) return undefined

    const closing = delimiterFor(context, delimiter)
    if (!closing) return undefined
    const nodeClosed = delimiter.to >= closing.length &&
        context.state.sliceDoc(delimiter.to - closing.length, delimiter.to) === closing

    // A finished construct on an earlier line does not affect the next line.
    if (delimiter.to < pos && nodeClosed) return undefined
    return delimiterIndentation(
        context,
        delimiter,
        pos,
        alignedDelimitedNodes.has(delimiter.name),
    ) ?? undefined
}

function typstIndentService(context: IndentContext, pos: number): number | undefined {
    return unfinishedDelimiterIndent(context, pos)
}

/** Extra indentation service used only by {@link typst_lezer}. */
export const typstLezerIndentService = indentService.of(typstIndentService)
