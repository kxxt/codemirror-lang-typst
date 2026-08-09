import {syntaxTree} from "@codemirror/language"
import {linter, type Diagnostic, type LintSource} from "@codemirror/lint"
import type {EditorState} from "@codemirror/state"
import type {SyntaxNode} from "@lezer/common"

type Delimiter = {
    open: string,
    close: string,
    description: string,
}

const delimiters: Readonly<Record<string, Delimiter>> = {
    CodeBlock: {open: "{", close: "}", description: "code block"},
    ContentBlock: {open: "[", close: "]", description: "content block"},
    Args: {open: "(", close: ")", description: "argument list"},
    MathArgs: {open: "(", close: ")", description: "math argument list"},
    Params: {open: "(", close: ")", description: "parameter list"},
    Array: {open: "(", close: ")", description: "array"},
    Dict: {open: "(", close: ")", description: "dictionary"},
    Parenthesized: {open: "(", close: ")", description: "parenthesized expression"},
    Destructuring: {open: "(", close: ")", description: "destructuring pattern"},
    Equation: {open: "$", close: "$", description: "equation"},
    Strong: {open: "*", close: "*", description: "strong emphasis"},
    Emph: {open: "_", close: "_", description: "emphasis"},
}

function zeroWidthMessage(node: SyntaxNode, state: EditorState): string {
    const parent = node.parent
    const next = state.sliceDoc(node.from, Math.min(node.from + 1, state.doc.length))
    if (next === "\"") return "Unclosed string; expected `\"`."
    if (!parent) return "Expected Typst syntax."

    switch (parent.name) {
        case "Args":
        case "MathArgs":
            return parent.getChild("LeftParen")
                ? "Expected `,` between arguments."
                : "Expected `(` to start an argument list."
        case "Params":
            return parent.getChild("LeftParen")
                ? "Expected `,` between parameters."
                : "Expected `(` to start a parameter list."
        case "ImportItems":
            return "Expected `,` between imported items."
        case "LetBinding":
            const equals = parent.getChild("Eq")
            return !equals || node.from <= equals.from
                ? "Expected a binding after `let`."
                : "Expected an expression after `=`."
        case "Closure":
            return "Expected `=` or `=>` after the function parameters."
        case "ForLoop":
            return parent.getChild("In")
                ? "Expected a loop body."
                : "Expected `in` in the for loop."
        case "WhileLoop":
            return "Expected a while-loop body."
        case "Conditional":
            return "Expected a conditional branch."
        case "ShowRule":
            return "Expected a show-rule body after `:`."
        case "ModuleImport":
        case "ModuleInclude":
            return "Expected a module source."
        case "MathAttach":
            return "Expected a math expression after the attachment operator."
        case "Typst":
            if (node.from > 0 && state.sliceDoc(node.from - 1, node.from) === "#") {
                return "Expected a code expression after `#`."
            }
            return "Expected an expression."
        default:
            return "Expected an expression."
    }
}

function errorMessage(node: SyntaxNode, state: EditorState): string {
    if (node.from === node.to) return zeroWidthMessage(node, state)

    const text = state.sliceDoc(node.from, node.to)
    const delimiter = node.parent ? delimiters[node.parent.name] : undefined
    if (delimiter && text === delimiter.open) {
        return `Unclosed ${delimiter.description}; expected \`${delimiter.close}\`.`
    }
    if (node.parent?.name === "LetBinding") return "Expected a binding after `let`."
    if (text.startsWith("<")) return "Unclosed label; expected `>`."
    if (text.startsWith("`")) return "Unclosed raw block."
    if (text.startsWith("\"")) return "Unclosed string; expected `\"`."
    if (text.startsWith("\\u{")) return "Invalid Unicode escape."
    if (/^https?:\/\//u.test(text)) return "Unclosed or malformed link."
    if (text.length <= 20 && !/\s/u.test(text)) return `Unexpected token \`${text}\`.`
    return "Invalid Typst syntax."
}

function unmatchedBlockComment(text: string): number | null {
    const openings: number[] = []
    for (let index = 0; index < text.length - 1; index++) {
        const pair = text.slice(index, index + 2)
        if (pair === "/*") {
            openings.push(index++)
        } else if (pair === "*/" && openings.length) {
            openings.pop()
            index++
        }
    }
    return openings.length ? openings[openings.length - 1] : null
}

function containsNonemptyError(node: SyntaxNode): boolean {
    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === "Error" && child.from < child.to) return true
        if (containsNonemptyError(child)) return true
    }
    return false
}

function isCascadingError(node: SyntaxNode): boolean {
    if (node.from !== node.to) return false
    const previous = node.prevSibling
    return !!previous && previous.to === node.from && containsNonemptyError(previous)
}

/** Return WASM-free syntax diagnostics from the native Typst Lezer tree. */
export function typstLezerDiagnostics(state: EditorState): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    const seenRanges = new Set<string>()
    const cursor = syntaxTree(state).cursor()

    do {
        let from = cursor.from
        let to = cursor.to
        let message: string | null = null

        if (cursor.name === "Error") {
            if (isCascadingError(cursor.node)) continue
            message = errorMessage(cursor.node, state)
        } else if (cursor.name === "BlockComment") {
            const opening = unmatchedBlockComment(state.sliceDoc(from, to))
            if (opening != null) {
                from += opening
                to = Math.min(from + 2, state.doc.length)
                message = "Unclosed block comment; expected `*/`."
            }
        }

        if (!message) continue
        const range = `${from}:${to}`
        if (seenRanges.has(range)) continue
        seenRanges.add(range)
        diagnostics.push({
            from,
            to,
            severity: "error",
            source: "Typst syntax",
            message,
        })
    } while (cursor.next())

    return diagnostics
}

/** CodeMirror lint source backed by {@link typstLezerDiagnostics}. */
export const typstLezerLintSource: LintSource = view =>
    typstLezerDiagnostics(view.state)

/** Syntax-linting extension installed only by {@link typst_lezer}. */
export const typstLezerLinter = linter(typstLezerLintSource)
