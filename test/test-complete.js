import ist from "ist"
import {CompletionContext} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"
import {typst_lezer} from "../dist/lezer.js"

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
