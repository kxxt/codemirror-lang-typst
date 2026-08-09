import ist from "ist"
import {LanguageDescription} from "@codemirror/language"
import {TreeFragment} from "@lezer/common"
import {highlightTree, tagHighlighter, tags} from "@lezer/highlight"
import {typst_lezer} from "../dist/lezer.js"

const embeddedTypst = typst_lezer().language

function resolvedName(support, doc, text) {
    const tree = support.language.parser.parse(doc)
    return tree.resolveInner(doc.indexOf(text), 1).name
}

describe("Typst fenced raw block languages", () => {
    it("selects an embedded parser from the raw language tag", () => {
        const seen = []
        const support = typst_lezer({
            codeLanguages(name) {
                seen.push(name)
                return name === "typ" ? embeddedTypst : null
            },
        })
        const doc = "```typ\n#let value = 1\n```"

        ist(resolvedName(support, doc, "#"), "Hash")
        ist(JSON.stringify(seen), JSON.stringify(["typ"]))
    })

    it("keeps document positions across indented lines", () => {
        const support = typst_lezer({codeLanguages: () => embeddedTypst})
        const doc = "```typ\n  #let first = 1\n  #let second = first\n```"
        const second = doc.indexOf("#", doc.indexOf("#") + 1)
        const node = support.language.parser.parse(doc).resolveInner(second, 1)

        ist(node.name, "Hash")
        ist(node.from, second)
        ist(node.to, second + 1)
    })

    it("matches LanguageDescription names and aliases", () => {
        const description = LanguageDescription.of({
            name: "Embedded Typst",
            alias: ["typ"],
            support: typst_lezer(),
        })
        const support = typst_lezer({codeLanguages: [description]})

        ist(resolvedName(support, "```typ\n#let value = 1\n```", "#"), "Hash")
    })

    it("uses a configurable default language", () => {
        const support = typst_lezer({defaultCodeLanguage: embeddedTypst})

        ist(resolvedName(support, "```\n#let value = 1\n```", "#"), "Hash")
        ist(resolvedName(support, "```unknown\n#let value = 1\n```", "#"), "Hash")
    })

    it("does not mount parsers in inline or unmatched raw text", () => {
        const configured = typst_lezer({
            codeLanguages: name => name === "typ" ? embeddedTypst : null,
        })

        ist(resolvedName(configured, "`#let value = 1`", "#"), "Text")
        ist(resolvedName(configured, "```other\n#let value = 1\n```", "#"), "Text")
    })

    it("uses the embedded language's highlight metadata", () => {
        const doc = "```typ\n#let value = 1\n```"
        const tree = typst_lezer({
            codeLanguages: name => name === "typ" ? embeddedTypst : null,
        }).language.parser.parse(doc)
        const highlighter = tagHighlighter([
            {tag: tags.keyword, class: "keyword"},
            {tag: tags.monospace, class: "raw"},
        ])
        const highlighted = []
        highlightTree(tree, highlighter, (from, to, classes) => {
            highlighted.push([doc.slice(from, to), classes])
        })

        ist(highlighted.some(([text, cls]) => text === "let" && cls === "keyword"), true)
        ist(highlighted.some(([text, cls]) => text.includes("```") && cls === "raw"), true)
    })

    it("retains embedded parsing across incremental updates", () => {
        const parser = typst_lezer({codeLanguages: () => embeddedTypst}).language.parser
        const before = "```typ\n#let value = 1\n```"
        const oldTree = parser.parse(before)
        const changed = before.indexOf("1")
        const after = `${before.slice(0, changed)}22${before.slice(changed + 1)}`
        const fragments = TreeFragment.applyChanges(TreeFragment.addTree(oldTree), [{
            fromA: changed,
            toA: changed + 1,
            fromB: changed,
            toB: changed + 2,
        }])
        const tree = parser.parse(after, fragments)

        ist(tree.resolveInner(after.indexOf("#"), 1).name, "Hash")
        ist(tree.resolveInner(after.indexOf("22"), 1).name, "Int")
    })
})
