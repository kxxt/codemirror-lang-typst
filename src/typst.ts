import {
    Input, NodePropSource, NodeSet, NodeType, Parser, PartialParse, Tree,
    TreeFragment,
} from "@lezer/common"
import {highlightingFor} from "@codemirror/language"
import {Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate} from "@codemirror/view"
import {TypstWasmParser} from "../wasm/typst_syntax.js"
import {typstHighlightTag} from "./highlight"

export class TypstParseContext implements PartialParse {
    stoppedAt: number | null = null

    constructor(
        readonly input: Input,
        readonly tree: Tree,
    ) {}

    get parsedPos() {
        return this.input.length
    }

    advance() {
        return this.tree
    }

    // This parser has no syntax work to defer, so returning the complete
    // placeholder tree is cheaper than splitting it into partial parses.
    stopAt(_pos: number) {}
}

/**
 * A placeholder parser used by `typst()` alongside the WASM
 * highlighter.
 */
export class TypstParser extends Parser {
    readonly nodeSet: NodeSet

    constructor(...props: NodePropSource[]) {
        super()
        const top = NodeType.define({name: "Typst", id: 0, top: true})
        this.nodeSet = new NodeSet([top]).extend(...props)
    }

    createParse(
        input: Input,
        _fragments: readonly TreeFragment[],
        _ranges: readonly {from: number, to: number}[],
    ): PartialParse {
        return new TypstParseContext(
            input,
            new Tree(this.nodeSet.types[0], [], [], input.length),
        )
    }

    /** @deprecated Parser synchronization is no longer necessary. */
    updateListener() {
        return []
    }

    /** @deprecated The placeholder parser has no mutable parser state. */
    clearParser() {}

    /** @deprecated The placeholder parser has no mutable syntax tree. */
    clearTree() {}
}

type TextEdit = {
    from: number,
    to: number,
    insert: string,
}

const highlightTags = (TypstWasmParser.get_highlight_tags() as string[])
    .map(name => typstHighlightTag[name])

const markCache = new Map<string, Decoration>()

class TypstHighlighter {
    parser: TypstWasmParser
    highlights: Uint32Array
    decorations: DecorationSet

    constructor(readonly view: EditorView) {
        this.parser = new TypstWasmParser(view.state.doc.toString())
        this.highlights = this.parser.highlight()
        this.decorations = createDecorations(view, this.highlights)
    }

    update(update: ViewUpdate) {
        if (update.docChanged) {
            const edits: TextEdit[] = []
            update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                edits.push({from: fromA, to: toA, insert: inserted.toString()})
            })

            try {
                const ranges = this.parser.edit_many(edits)
                if (this.parser.length() != update.state.doc.length) {
                    throw new RangeError("Typst parser document length is out of sync")
                }
                this.highlights = patchHighlights(this.highlights, update.changes, ranges, this.parser)
            } catch (_) {
                // A fresh parser is a safe fallback if an incremental update
                // cannot be applied. This does not affect the editor update.
                const previous = this.parser
                this.parser = new TypstWasmParser(update.state.doc.toString())
                this.highlights = this.parser.highlight()
                previous.free()
            }
        }

        if (update.docChanged || update.transactions.some(transaction => transaction.reconfigured)) {
            this.decorations = createDecorations(update.view, this.highlights)
        }
    }

    destroy() {
        this.parser.free()
    }
}

/**
 * Update a highlight buffer (UTF-16 `(from, to, tag)` triples) after a
 * document change, without re-highlighting the whole document.
 *
 * The ranges the incremental parser had to reparse (`ranges`) are removed from
 * the buffer and recomputed via [`TypstWasmParser.highlight_range`]; all other
 * highlights are reused, only their positions are mapped through the change.
 */
export function patchHighlights(
    highlights: Uint32Array,
    changes: {mapPos(pos: number, assoc?: number): number},
    ranges: Uint32Array,
    parser: TypstWasmParser,
): Uint32Array {
    // Map the previous highlights through the change, dropping ranges that
    // were fully deleted.
    const kept = []
    for (let i = 0; i < highlights.length; i += 3) {
        const from = changes.mapPos(highlights[i], 1)
        const to = changes.mapPos(highlights[i + 1], -1)
        if (from < to) kept.push(from, to, highlights[i + 2])
    }

    // Keep only the highlights that are not affected by a reparsed range.
    const filtered = []
    outer: for (let i = 0; i < kept.length; i += 3) {
        for (let r = 0; r < ranges.length; r += 2) {
            if (kept[i] < ranges[r + 1] && ranges[r] < kept[i + 1]) continue outer
        }
        filtered.push(kept[i], kept[i + 1], kept[i + 2])
    }

    // Recompute the highlights for the reparsed ranges.
    const fresh = []
    for (let r = 0; r < ranges.length; r += 2) {
        const triples = parser.highlight_range(ranges[r], ranges[r + 1])
        for (let i = 0; i < triples.length; i += 3) {
            fresh.push(triples[i], triples[i + 1], triples[i + 2])
        }
    }

    // `Decoration.set` sorts the ranges, so no explicit ordering is needed.
    return Uint32Array.from(filtered.concat(fresh))
}

function createDecorations(view: EditorView, highlights: Uint32Array): DecorationSet {
    const ranges = []
    const documentLength = view.state.doc.length

    for (let i = 0; i < highlights.length; i += 3) {
        const from = Math.min(highlights[i], documentLength)
        const to = Math.min(highlights[i + 1], documentLength)
        const tag = highlightTags[highlights[i + 2]]
        if (!tag || from >= to) continue

        const className = highlightingFor(view.state, [tag])
        if (!className) continue
        let mark = markCache.get(className)
        if (!mark) markCache.set(className, mark = Decoration.mark({class: className}))
        ranges.push(mark.range(from, to))
    }

    return Decoration.set(ranges, true)
}

/**
 * Incremental Typst syntax highlighting implemented as CodeMirror
 * decorations, without exposing the Typst syntax tree as a Lezer tree.
 */
export const typstHighlighting = ViewPlugin.fromClass(TypstHighlighter, {
    decorations: value => value.decorations,
})
