import ist from "ist"
import {EditorState} from "@codemirror/state"
import {
    typst_lezer,
    typstLezerDiagnostics,
    typstLezerLinter,
    typstLezerLintSource,
} from "../dist/lezer.js"

function state(doc) {
    return EditorState.create({doc, extensions: [typst_lezer()]})
}

function diagnostics(doc) {
    return typstLezerDiagnostics(state(doc))
}

function diagnostic(doc) {
    const result = diagnostics(doc)
    ist(result.length, 1)
    return result[0]
}

describe("Typst Lezer linting", () => {
    it("reports unclosed structural delimiters", () => {
        const cases = [
            ["#{ value", "Unclosed code block; expected `}`."],
            ["#[content", "Unclosed content block; expected `]`."],
            ["#foo(value", "Unclosed argument list; expected `)`."],
            ["#let f(value", "Unclosed parameter list; expected `)`."],
            ["$x", "Unclosed equation; expected `$`."],
            ["*strong", "Unclosed strong emphasis; expected `*`."],
            ["_emphasis", "Unclosed emphasis; expected `_`."],
        ]
        for (const [doc, message] of cases) ist(diagnostic(doc).message, message)
    })

    it("reports missing expressions, bindings, separators, and loop syntax", () => {
        ist(diagnostic("#").message, "Expected a code expression after `#`.")
        ist(diagnostic("#let = 1").message, "Expected a binding after `let`.")
        ist(diagnostic("#let value =").message, "Expected an expression after `=`.")
        ist(diagnostic("#foo(first second)").message, "Expected `,` between arguments.")
        ist(diagnostic("#for item values []").message, "Expected `in` in the for loop.")
        ist(diagnostic("#if true").message, "Expected a conditional branch.")
    })

    it("reports malformed lexical constructs", () => {
        ist(diagnostic("<target").message, "Unclosed label; expected `>`.")
        ist(diagnostic("`raw").message, "Unclosed raw block.")
        ist(diagnostic("\\u{xyz}").message, "Invalid Unicode escape.")
        ist(diagnostic("https://example.test(path").message, "Unclosed or malformed link.")
        ist(diagnostic("/* outer /* nested */").message,
            "Unclosed block comment; expected `*/`.")
    })

    it("does not report valid syntax", () => {
        ist(diagnostics("= Heading <heading>\nSee @heading").length, 0)
        ist(diagnostics("#{ let value = (1, 2); value }").length, 0)
        ist(diagnostics("/* outer /* nested */ complete */").length, 0)
        ist(diagnostics("```typ\n#let value = 1\n```").length, 0)
    })

    it("returns CodeMirror diagnostics with stable metadata and ranges", () => {
        const result = diagnostic("#{ value")
        ist(result.from, 1)
        ist(result.to, 2)
        ist(result.severity, "error")
        ist(result.source, "Typst syntax")
    })

    it("exports a lint source and registers it with typst_lezer", () => {
        const editor = state("<target")
        const result = typstLezerLintSource({state: editor})
        ist(result.length, 1)
        ist(typst_lezer().support.includes(typstLezerLinter), true)
    })
})
