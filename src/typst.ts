import {
    Tree, NodeType, TreeFragment, NodeSet, Parser, NodePropSource, Input, PartialParse
} from "@lezer/common"
import { TypstWasmParser } from "../wasm/typst_syntax"
import { StateField } from "@codemirror/state"

export class TypstParseContext implements PartialParse {
    private parsed: number
    stoppedAt: number | null = null

    /// @internal
    constructor(
        readonly parser: TypstParser,
        /// @internal
        readonly input: Input,
        fragments: readonly TreeFragment[],
        /// @internal
        readonly ranges: readonly { from: number, to: number }[],
    ) {
        this.parsed = 0;
    }

    get parsedPos() {
        return this.parsed
    }

    advance() {
        return this.parser.tree()
    }

    stopAt(pos: number) {
        if (this.stoppedAt != null && this.stoppedAt < pos) throw new RangeError("Can't move stoppedAt forward")
        this.stoppedAt = pos
    }
}

type Edit = ChildrenSplice | UpdateParent

type ChildrenSplice = {
    kind: 'ChildrenSplice'
    prefix: [number],
    from: number,
    to: number,
    replacement: [any]
}

type UpdateParent = {
    kind: 'UpdateParent'
    prefix: [number],
    prev: number,
    new: number,
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export class TypstParser extends Parser {
    /// @internal
    parser: TypstWasmParser | null
    nodeSet: NodeSet
    last_tree: Tree | null

    /// @internal
    constructor(
        highlighting: NodePropSource,
    ) {
        super()
        this.parser = null
        this.last_tree = null
        const syntax_types = TypstWasmParser.get_node_types()
        const node_types = [NodeType.none]
        for (const [ty_name, ty_id] of syntax_types) {
            node_types.push(NodeType.define({
                name: ty_name,
                id: ty_id
            }))
        }
        this.nodeSet = new NodeSet(node_types).extend(highlighting)
    }

    // Get an update listener for syncing typst parser state with the document
    updateListener() {
        let parser = this;
        return StateField.define({
            create() { return null; },
            update(value, transaction) {
                if (transaction.docChanged) {
                    transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                        let edits = parser.parser?.edit(fromA, toA, inserted.toString())
                        if (edits.full_update) {
                            parser.clear_tree()
                        } else {
                            // Apply incremental edits
                            for (const edit of edits.edits) {
                                parser.apply_tree_edit(edit)
                            }
                        }
                    })
                }
                return null;
            }
        })
    }

    createParse(input: Input, fragments: readonly TreeFragment[], ranges: readonly { from: number, to: number }[]): PartialParse {
        if (this.parser == null)
            this.parser = new TypstWasmParser(input.read(0, input.length))
        let parse: PartialParse = new TypstParseContext(this, input, fragments, ranges)
        return parse
    }

    clear_tree() {
        this.last_tree = null
    }

    apply_tree_edit(edit: Edit) {
        let parent: Mutable<Tree>;
        let positions: number[];
        switch (edit.kind) {
            case "ChildrenSplice":
                parent = locateSubTree(this.last_tree!, edit.prefix);
                for (const newChild of edit.replacement) {
                    mountPrototypes(this.nodeSet, newChild)
                }
                // calculate new length
                let superseded_length = parent.children.slice(edit.from, edit.to).reduce((acc: any, v: any) => acc + v.length, 0);
                let replacement_length = edit.replacement.reduce((acc: any, v: any) => acc + v.length, 0);
                (parent.children as Tree[]).splice(edit.from, edit.to - edit.from, ...edit.replacement);
                positions = parent.positions as number[];
                positions.splice(edit.from, edit.to - edit.from, ...new Array(edit.replacement.length).fill(0))
                parent.length += replacement_length - superseded_length
                let len_acc = (parent.positions[edit.from - 1] ?? 0) + (parent.children[edit.from - 1]?.length ?? 0)
                for (let i = edit.from; i < parent.positions.length; i++) {
                    positions[i] = len_acc;
                    len_acc += parent.children[i].length
                }
                break;
            case "UpdateParent":
                let i = edit.prefix.pop()!;
                parent = locateSubTree(this.last_tree!, edit.prefix);
                const delta = edit.new - edit.prev
                parent.length += delta
                positions = parent.positions as number[];
                for (let j = i + 1; j < parent.positions.length; j++) {
                    positions[j] += delta
                }
                break;
        }
    }

    tree(): Tree | null {
        if (this.last_tree)
            return this.last_tree
        let parsed = this.parser?.tree();
        if (parsed == null)
            return null;
        this.last_tree = mountPrototypes(this.nodeSet, parsed);
        return this.last_tree
    }
}

function locateSubTree(tree: Tree, prefix: number[]): Tree {
    let curr = tree
    for (const i of prefix) {
        curr = curr.children[i] as Tree
    }
    return curr
}

// Recursively mount prototypes onto the parsed tree
function mountPrototypes(nodeSet: NodeSet, tree: any): Tree {
    Object.setPrototypeOf(tree, Tree.prototype)
    tree.type = nodeSet.types[tree.kind]
    for (const child of tree.children) {
        mountPrototypes(nodeSet, child)
    }
    return tree
}

