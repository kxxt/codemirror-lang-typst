import ist from "ist"
import {CompletionContext} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"
import {typstBuiltinSignatures, typst_lezer} from "../dist/lezer.js"

async function complete(doc, pos = doc.length, explicit = false) {
    const state = EditorState.create({doc, extensions: [typst_lezer()]})
    const sources = state.languageDataAt("autocomplete", pos)
    ist(sources.length, 1)
    return sources[0](new CompletionContext(state, pos, explicit))
}

function option(result, label) {
    return result?.options.find(completion => completion.label === label)
}

describe("Typst Lezer autocomplete", () => {
    it("completes global functions, types, constants, and modules", async () => {
        const result = await complete("#hea")
        ist(result.from, 1)
        ist(option(result, "heading").type, "function")
        ist(option(result, "int").type, "type")
        ist(option(result, "black").type, "constant")
        ist(option(result, "sym").type, "namespace")
    })

    it("completes Typst's math scope and symbols", async () => {
        const result = await complete("$alp$", 4)
        ist(result.from, 1)
        ist(option(result, "sqrt").type, "function")
        ist(option(result, "thin").type, "constant")
        ist(option(result, "alpha").type, "constant")
        ist(option(result, "heading"), undefined)
    })

    it("switches from math to the global scope after a hash", async () => {
        const result = await complete("$#col$", 5)
        ist(result.from, 2)
        ist(option(result, "colbreak").type, "function")
        ist(option(result, "colon"), undefined)
    })

    it("completes symbol properties and nested modifiers", async () => {
        const afterDot = await complete("$arrow.$", 7)
        ist(afterDot.from, 7)
        ist(option(afterDot, "r").type, "property")

        const root = await complete("$arrow.r$", 8)
        ist(root.from, 7)
        ist(option(root, "r").type, "property")
        ist(option(root, "l").type, "property")
        ist(option(root, "long"), undefined)

        const right = await complete("$arrow.r.$", 9)
        ist(right.from, 9)
        ist(option(right, "long").type, "property")
        ist(option(right, "double").type, "property")

        const long = await complete("$arrow.r.long.$", 14)
        ist(option(long, "bar").type, "property")
        ist(option(long, "squiggly").type, "property")
    })

    it("completes built-in namespace properties", async () => {
        const sym = await complete("#sym.arrow.r")
        ist(sym.from, 11)
        ist(option(sym, "r").type, "property")

        const math = await complete("#math.sq")
        ist(option(math, "sqrt").type, "function")
        ist(option(math, "square").type, "constant")

        const calc = await complete("#calc.si")
        ist(option(calc, "sin").type, "function")
        ist(option(calc, "sinh").type, "function")

        const sys = await complete("#sys.ver")
        ist(option(sys, "version").type, "property")
    })

    it("completes built-in function parameter names", async () => {
        const result = await complete("#strike(")
        ist(result.from, 8)
        for (const name of ["stroke", "offset", "extent", "background"]) {
            ist(option(result, name).type, "property")
            ist(option(result, name).apply, `${name}: `)
        }
        ist(option(result, "body"), undefined)
    })

    it("offers values for the first configurable parameter", async () => {
        const result = await complete("#strike(")
        for (const color of ["black", "blue", "red"]) {
            ist(option(result, color).type, "constant")
        }
        for (const value of ["auto", "1pt", "gradient", "tiling", "dictionary"]) {
            ist(!!option(result, value), true)
        }
    })

    it("uses the named parameter's accepted types", async () => {
        const stroke = await complete("#strike(stroke: re")
        ist(stroke.from, 16)
        ist(option(stroke, "red").type, "constant")
        ist(!!option(stroke, "auto"), true)
        ist(!!option(stroke, "1pt"), true)
        ist(!!option(stroke, "gradient"), true)
        ist(option(stroke, "true"), undefined)

        const offset = await complete("#strike(offset: ")
        ist(!!option(offset, "auto"), true)
        ist(!!option(offset, "1pt"), true)
        ist(option(offset, "red"), undefined)

        const background = await complete("#strike(background: ")
        ist(option(background, "true").type, "constant")
        ist(option(background, "false").type, "constant")
        ist(option(background, "red"), undefined)
    })

    it("completes literal enums and set-rule parameters", async () => {
        const style = await complete('#text(style: "i')
        ist(style.from, 13)
        ist(option(style, '"italic"').type, "enum")
        ist(option(style, '"normal"').type, "enum")

        const fill = await complete("#set text(fill: ")
        ist(option(fill, "red").type, "constant")
        ist(!!option(fill, "gradient"), true)
    })

    it("does not repeat named parameters already supplied", async () => {
        const result = await complete("#strike(stroke: red, ")
        ist(option(result, "stroke"), undefined)
        ist(option(result, "offset").type, "property")
    })

    it("publishes Typst's reflected built-in signature metadata", () => {
        const strike = typstBuiltinSignatures.strike
        ist(strike.find(parameter => parameter[0] === "stroke")[2].includes("type:color"), true)
        ist(strike.find(parameter => parameter[0] === "background")[2].includes("type:bool"), true)
        ist(typstBuiltinSignatures["calc.sin"][0][0], "angle")
    })

    it("supports code blocks and explicit completion at an empty expression", async () => {
        const result = await complete("#{ }", 2, true)
        ist(result.from, 2)
        ist(option(result, "document").type, "function")
    })

    it("does not complete markup, comments, raw text, or field accesses", async () => {
        ist(await complete("plain", 5, true), null)
        ist(await complete("// #hea"), null)
        ist(await complete("`#hea`", 5), null)
        ist(await complete("#foo.he"), null)
        ist(await complete("arrow.r"), null)
    })
})
