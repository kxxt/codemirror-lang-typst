import type {
    Completion,
    CompletionContext,
    CompletionResult,
    CompletionSource,
} from "@codemirror/autocomplete"
import {syntaxTree} from "@codemirror/language"
import type {SyntaxNode} from "@lezer/common"
import {
    typstBuiltinSignatures,
    type TypstBuiltinParameter,
} from "./signatures"
import {typstSymbolPropertyNames} from "./symbols"

function words(source: string): string[] {
    return source.trim().split(/\s+/)
}

function options(
    names: readonly string[],
    type: string,
    detail: string,
): Completion[] {
    return names.map(label => ({
        label,
        type,
        detail,
        commitCharacters: type === "function" ? ["("] : undefined,
    }))
}

function unique(...groups: readonly (readonly Completion[])[]): readonly Completion[] {
    const seen = new Set<string>()
    const result: Completion[] = []
    for (const group of groups) {
        for (const completion of group) {
            if (!seen.has(completion.label)) {
                seen.add(completion.label)
                result.push(completion)
            }
        }
    }
    return result
}

// These definitions mirror the default global scope constructed by
// typst-library 0.15.0. Elements are callable values in Typst, so CodeMirror
// presents them with the same icon as other built-in functions.
const globalElements = words(`
    document par parbreak strong emph list enum terms link title heading divider
    figure quote footnote outline ref cite bibliography table text linebreak
    smartquote sub super underline overline strike highlight smallcaps raw page
    pagebreak v h box block stack grid columns colbreak place align pad repeat move
    scale rotate skew hide image line rect square ellipse circle polygon curve
    metadata
`)

const globalFunctions = words(`
    repr panic assert eval plugin target numbering lower upper lorem measure layout
    here query locate read csv json toml yaml cbor xml luma oklab oklch rgb cmyk
    range
`)

const globalTypes = words(`
    bool int float str label bytes content array dictionary function arguments type
    module regex selector datetime decimal symbol duration version path length angle
    ratio relative fraction direction alignment color gradient tiling stroke location
    counter state
`)

const colorConstants = words(`
    black gray silver white navy blue aqua teal eastern purple fuchsia maroon red
    orange yellow olive green lime
`)

const directionConstants = words(`ltr rtl ttb btt`)
const alignmentConstants = words(`start left center right end top horizon bottom`)
const globalConstants = [
    ...words("none auto true false"),
    ...colorConstants,
    ...directionConstants,
    ...alignmentConstants,
]

const globalModules = words(`
    std calc sys math pdf sym emoji
`)

/** Typst 0.15 definitions available in code expressions. */
export const typstGlobalCompletions: readonly Completion[] = unique(
    options(globalElements, "function", "Typst built-in element"),
    options(globalFunctions, "function", "Typst built-in function"),
    options(globalTypes, "type", "Typst built-in type"),
    options(globalConstants, "constant", "Typst built-in constant"),
    options(globalModules, "namespace", "Typst built-in module"),
)

const mathFunctions = words(`
    equation text lr mid attach stretch scripts limits accent underline overline
    underbrace overbrace underbracket overbracket underparen overparen undershell
    overshell cancel frac binom vec mat cases root class op primes abs norm round
    sqrt upright bold italic serif sans scr cal frak mono bb display inline script
    sscript
`)

const mathConstants = words(`
    thin med thick quad wide dif Dif
`)

const mathOperators = words(`
    arccos arcsin arctan arg cos cosh cot coth csc csch ctg deg det dim exp gcd lcm
    hom id im inf ker lg lim liminf limsup ln log max min mod Pr sec sech sin sinc
    sinh sup tan tanh tg tr
`)

// Top-level names in codex's `sym` module. Typst exposes these directly inside
// equations and through the global `sym` module.
const mathSymbols = words(`
    wj zwj zwnj zws lrm rlm space paren brace bracket shell bag mustache bar fence
    chevron ceil floor corner amp ast at backslash co colon comma dagger dash
    underscore dot excl quest interrobang hash hyph numero percent permille permyriad
    pilcrow section semi slash dots tilde acute breve caret caron hat diaer grave
    macron quote prime plus minus div times ratio eq gt lt approx prec succ equiv smt
    lat prop original image asymp emptyset nothing without complement in subset supset
    union inter infinity oo partial gradient nabla sum product integral laplace forall
    exists top bot not and or xor models forces therefore because qed mapsto mapsfrom
    compose convolve multimap tiny miny divides wreath angle angzarr parallel perp
    earth jupiter mars mercury neptune saturn sun uranus venus diameter interleave join
    bowtie hourglass degree smash power smile frown afghani baht bitcoin cedi cent
    currency dollar dong dorome dram euro guarani hryvnia kip lari lira manat naira
    pataca peso pound riel riyal ruble rupee shekel som taka taman tenge togrog won yen
    yuan ballot checkmark crossmark floral refmark cc copyright copyleft trademark
    maltese suit note rest natural flat sharp bullet circle ellipse triangle square rect
    penta hexa diamond lozenge parallelogram star arrow arrows arrowhead harpoon harpoons
    tack zero alpha beta chi delta digamma epsilon eta gamma iota kappa lambda mu nu
    omega omicron phi pi psi rho sigma tau theta upsilon xi zeta Alpha Beta Chi Delta
    Digamma Epsilon Eta Gamma Iota Kappa Lambda Mu Nu Omega Omicron Phi Pi Psi Rho
    Sigma Tau Theta Upsilon Xi Zeta sha Sha aleph beth gimel daleth AA BB CC DD EE FF
    GG HH II JJ KK LL MM NN OO PP QQ RR SS TT UU VV WW XX YY ZZ angstrom ell pee
    planck Re Im dotless die errorbar spacebar gender control
`)

/** Top-level definitions in Typst 0.15's `sym` module. */
export const typstSymbolCompletions: readonly Completion[] = options(
    mathSymbols,
    "constant",
    "Typst symbol",
)

/** Typst 0.15 definitions available directly in math mode. */
export const typstMathCompletions: readonly Completion[] = unique(
    options(mathFunctions, "function", "Typst math function"),
    options(mathConstants, "constant", "Typst math constant"),
    options(mathOperators, "constant", "Typst math operator"),
    typstSymbolCompletions,
)

const calcFunctions = words(`
    abs pow exp sqrt root sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh
    atanh log ln erf fact perm binom gcd lcm floor ceil trunc fract round clamp min max
    even odd rem div-euclid rem-euclid quo norm
`)

const typstCalcCompletions = unique(
    options(calcFunctions, "function", "Typst calc function"),
    options(words("inf pi tau e"), "constant", "Typst calc constant"),
)

const typstSysCompletions = options(
    words("version inputs"),
    "property",
    "Typst system property",
)

const typstPdfCompletions = options(
    words("attach artifact"),
    "function",
    "Typst PDF function",
)

const blockedNodes = new Set([
    "Shebang", "LineComment", "BlockComment", "Raw", "Str", "Link", "Label", "Ref",
])

function hasAncestor(node: SyntaxNode, names: ReadonlySet<string>): boolean {
    for (let current: SyntaxNode | null = node; current; current = current.parent) {
        if (names.has(current.name)) return true
    }
    return false
}

const fieldAccessNodes = new Set(["FieldAccess", "MathFieldAccess"])
const codeFieldAccessNodes = new Set(["FieldAccess"])
const mathNodes = new Set(["Math", "Equation", "MathIdent", "MathText"])
const codeNodes = new Set([
    "Code", "CodeBlock", "Ident", "LetBinding", "SetRule", "ShowRule", "Contextual",
    "Conditional", "WhileLoop", "ForLoop", "ModuleImport", "ModuleInclude", "FuncCall",
    "Args", "Array", "Dict", "Closure", "Parenthesized", "Unary", "Binary",
])

function isDefinitionOrKey(node: SyntaxNode): boolean {
    if (node.name !== "Ident" || !node.parent) return false
    const parent = node.parent
    if ((parent.name === "Named" || parent.name === "Keyed") && node.from === parent.from) {
        return true
    }
    if (parent.name === "Params") return true
    if (parent.name === "LetBinding") {
        const name = parent.getChild("Ident")
        return !!name && name.from === node.from && name.to === node.to
    }
    return false
}

type Scope = "global" | "math"

function accessScope(
    context: CompletionContext,
    node: SyntaxNode,
    from: number,
): Scope | null {
    if (hasAncestor(node, blockedNodes)) return null

    // An adjacent hash switches from markup or math into code. A regular
    // FieldAccess likewise belongs to code, even when nested in an equation.
    if (from > 0 && context.state.sliceDoc(from - 1, from) === "#") return "global"
    if (hasAncestor(node, codeFieldAccessNodes)) return "global"
    if (hasAncestor(node, mathNodes)) return "math"
    if (hasAncestor(node, codeNodes)) return "global"
    return null
}

function completionScope(
    context: CompletionContext,
    node: SyntaxNode,
    from: number,
): Scope | null {
    if (hasAncestor(node, blockedNodes) || hasAncestor(node, fieldAccessNodes)) return null
    if (isDefinitionOrKey(node)) return null

    // A hash switches from markup or math into a code expression.
    if (from > 0 && context.state.sliceDoc(from - 1, from) === "#") return "global"
    if (hasAncestor(node, mathNodes)) return "math"
    if (hasAncestor(node, codeNodes)) return "global"
    return null
}

const validIdentifier = /^[\p{ID_Continue}_-]*$/u
const dottedIdentifier = /[\p{ID_Start}_][\p{ID_Continue}_-]*(?:\.[\p{ID_Start}_][\p{ID_Continue}_-]*)*\.[\p{ID_Continue}_-]*$/u

const symbolPropertyCache = new Map<string, readonly Completion[]>()

function symbolProperties(path: readonly string[]): readonly Completion[] | null {
    const key = path.join(".")
    const names = typstSymbolPropertyNames[key]
    if (!names) return null

    let completions = symbolPropertyCache.get(key)
    if (!completions) {
        completions = options(names, "property", `Typst symbol property on ${key}`)
        symbolPropertyCache.set(key, completions)
    }
    return completions
}

function globalProperties(path: readonly string[]): readonly Completion[] | null {
    if (path[0] === "std") {
        return path.length === 1 ? typstGlobalCompletions : globalProperties(path.slice(1))
    }

    switch (path[0]) {
        case "sym":
            return path.length === 1
                ? typstSymbolCompletions
                : symbolProperties(path.slice(1))
        case "math":
            return path.length === 1
                ? typstMathCompletions
                : symbolProperties(path.slice(1))
        case "calc":
            return path.length === 1 ? typstCalcCompletions : null
        case "sys":
            return path.length === 1 ? typstSysCompletions : null
        case "pdf":
            return path.length === 1 ? typstPdfCompletions : null
        default:
            return null
    }
}

function propertyCompletion(
    context: CompletionContext,
    node: SyntaxNode,
    word: {from: number, to: number, text: string},
): CompletionResult | null {
    const access = context.matchBefore(dottedIdentifier)
    if (!access) return null

    const path = access.text.split(".")
    path.pop()
    const scope = accessScope(context, node, access.from)
    if (!scope) return null

    const propertyOptions = scope === "math"
        ? symbolProperties(path)
        : globalProperties(path)
    if (!propertyOptions) return null

    return {
        from: word.from,
        options: propertyOptions,
        validFor: validIdentifier,
    }
}

const POSITIONAL = 1
const NAMED = 2
const VARIADIC = 4
const SETTABLE = 16

function valueCompletion(
    label: string,
    type: string,
    detail: string,
    apply?: string,
): Completion {
    return {label, type, detail, apply}
}

const colorValueCompletions = unique(
    options(colorConstants, "constant", "Typst color"),
    options(words("luma oklab oklch rgb cmyk"), "function", "Typst color constructor"),
)

const directionValueCompletions = options(
    directionConstants,
    "constant",
    "Typst direction",
)

const alignmentValueCompletions = options(
    alignmentConstants,
    "constant",
    "Typst alignment",
)

const inputCompletionCache = new Map<string, readonly Completion[]>()

function completionsForInput(input: readonly string[]): readonly Completion[] {
    const cacheKey = input.join("\u001f")
    const cached = inputCompletionCache.get(cacheKey)
    if (cached) return cached

    const groups: (readonly Completion[])[] = []
    for (const part of input) {
        if (part.startsWith("value:")) {
            groups.push([
                valueCompletion(part.slice(6), "enum", "Accepted value"),
            ])
            continue
        }

        const type = part.startsWith("type:") ? part.slice(5) : part
        switch (type) {
            case "any":
                groups.push(typstGlobalCompletions)
                break
            case "auto":
            case "none":
                groups.push([valueCompletion(type, "constant", `Typst ${type} value`)])
                break
            case "bool":
                groups.push(options(words("true false"), "constant", "Boolean value"))
                break
            case "color":
                groups.push(colorValueCompletions)
                break
            case "alignment":
                groups.push(alignmentValueCompletions)
                break
            case "direction":
                groups.push(directionValueCompletions)
                break
            case "length":
                groups.push(options(words("1pt 1em 1cm"), "constant", "Length value"))
                break
            case "relative":
                groups.push(options(words("1pt 100%"), "constant", "Relative length"))
                break
            case "ratio":
                groups.push([valueCompletion("100%", "constant", "Ratio value")])
                break
            case "fraction":
                groups.push([valueCompletion("1fr", "constant", "Fraction value")])
                break
            case "angle":
                groups.push([valueCompletion("0deg", "constant", "Angle value")])
                break
            case "int":
                groups.push(options(words("0 1"), "constant", "Integer value"))
                break
            case "float":
                groups.push([valueCompletion("0.0", "constant", "Floating-point value")])
                break
            case "str":
                groups.push([valueCompletion("string", "text", "String value", "\"\"")])
                break
            case "content":
                groups.push([valueCompletion("content", "text", "Content value", "[]")])
                break
            case "array":
                groups.push([valueCompletion("array", "type", "Array value", "()")])
                break
            case "dictionary":
                groups.push([valueCompletion("dictionary", "type", "Dictionary value", "(:)")])
                break
            case "function":
                groups.push([
                    valueCompletion("function", "function", "Function value", "(value) => value"),
                ])
                break
            case "label":
                groups.push([valueCompletion("label", "type", "Label value", "<label>")])
                break
            case "gradient":
            case "stroke":
            case "tiling": {
                const completion = typstGlobalCompletions.find(option => option.label === type)
                if (completion) groups.push([completion])
                break
            }
            default: {
                const completion = typstGlobalCompletions.find(option => option.label === type)
                groups.push(completion
                    ? [completion]
                    : [valueCompletion(type, "type", `Value of type ${type}`)])
                break
            }
        }
    }

    const result = unique(...groups)
    inputCompletionCache.set(cacheKey, result)
    return result
}

const argumentBarriers = new Set([
    "Array", "Dict", "Parenthesized", "CodeBlock", "ContentBlock",
])

function activeArgs(node: SyntaxNode): SyntaxNode | null {
    for (let current: SyntaxNode | null = node; current; current = current.parent) {
        if (current.name === "Args" || current.name === "MathArgs") return current
        if (argumentBarriers.has(current.name)) return null
    }
    return null
}

type CallSite = {
    signature: readonly TypstBuiltinParameter[],
    argsFrom: number,
    setRule: boolean,
}

function callSite(
    context: CompletionContext,
    treeNode: SyntaxNode,
): CallSite | null {
    let probe = context.pos
    while (probe > 0 && /\s/u.test(context.state.sliceDoc(probe - 1, probe))) probe--
    const node = probe === context.pos
        ? treeNode
        : syntaxTree(context.state).resolveInner(probe, -1)
    const args = activeArgs(node)
    const parent = args?.parent
    if (!args || !parent) return null

    let callee: string | null = null
    let setRule = false
    if (parent.name === "FuncCall" || parent.name === "MathCall") {
        callee = context.state.sliceDoc(parent.from, args.from).trim().replace(/\s+/gu, "")
        if (parent.name === "MathCall" && !callee.includes(".")) callee = `math.${callee}`
    } else if (parent.name === "SetRule") {
        const before = context.state.sliceDoc(parent.from, args.from)
        const match = /\bset\s+([\p{ID_Continue}_-]+(?:\.[\p{ID_Continue}_-]+)*)\s*$/u.exec(before)
        callee = match?.[1] ?? null
        setRule = true
    }

    if (!callee) return null
    if (callee.startsWith("std.")) callee = callee.slice(4)
    const signature = typstBuiltinSignatures[callee]
    return signature ? {signature, argsFrom: args.from + 1, setRule} : null
}

type ArgumentState = {
    current: string,
    existingNamed: ReadonlySet<string>,
    positional: number,
    first: boolean,
}

function argumentState(text: string): ArgumentState {
    const starts = [0]
    const stack: string[] = []
    let quote = false
    let escaped = false
    let lineComment = false
    let blockComment = 0

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        const next = text[i + 1]
        if (lineComment) {
            if (ch === "\n") lineComment = false
            continue
        }
        if (blockComment) {
            if (ch === "/" && next === "*") { blockComment++; i++; continue }
            if (ch === "*" && next === "/") { blockComment--; i++; continue }
            continue
        }
        if (quote) {
            if (escaped) escaped = false
            else if (ch === "\\") escaped = true
            else if (ch === "\"") quote = false
            continue
        }
        if (ch === "/" && next === "/") { lineComment = true; i++; continue }
        if (ch === "/" && next === "*") { blockComment = 1; i++; continue }
        if (ch === "\"") { quote = true; continue }
        if (ch === "(" || ch === "[" || ch === "{") stack.push(ch)
        else if (ch === ")" || ch === "]" || ch === "}") stack.pop()
        else if (ch === "," && stack.length === 0) starts.push(i + 1)
    }

    const existingNamed = new Set<string>()
    let positional = 0
    for (let i = 0; i < starts.length - 1; i++) {
        const segment = text.slice(starts[i], starts[i + 1] - 1).trim()
        const named = /^([\p{ID_Start}_][\p{ID_Continue}_-]*)\s*:/u.exec(segment)
        if (named) existingNamed.add(named[1])
        else if (segment) positional++
    }

    return {
        current: text.slice(starts[starts.length - 1]),
        existingNamed,
        positional,
        first: starts.length === 1,
    }
}

function parameterNameCompletion(parameter: TypstBuiltinParameter): Completion {
    const [name, , input] = parameter
    const accepts = input.map(part => part.replace(/^(?:type|value):/, "")).join(" | ")
    return {
        label: name,
        apply: `${name}: `,
        type: "property",
        detail: accepts ? `parameter · ${accepts}` : "parameter",
        boost: 50,
    }
}

function parameterCompletion(
    context: CompletionContext,
    treeNode: SyntaxNode,
    word: {from: number, to: number, text: string},
): CompletionResult | null {
    const site = callSite(context, treeNode)
    if (!site) return null

    const state = argumentState(context.state.sliceDoc(site.argsFrom, context.pos))
    const available = site.signature.filter(parameter =>
        (!site.setRule || (parameter[1] & SETTABLE) !== 0) &&
        !state.existingNamed.has(parameter[0]))
    const named = /^\s*([\p{ID_Start}_][\p{ID_Continue}_-]*)\s*:/u.exec(state.current)

    if (named) {
        const parameter = site.signature.find(item =>
            item[0] === named[1] && (!site.setRule || (item[1] & SETTABLE) !== 0))
        const token = context.matchBefore(/(?:"[^"\n]*|[\p{ID_Continue}_-]*)$/u) ?? word
        return {
            from: token.from,
            options: parameter ? completionsForInput(parameter[2]) : [],
        }
    }

    const completionGroups: (readonly Completion[])[] = []
    if (/^\s*[\p{ID_Continue}_-]*$/u.test(state.current)) {
        completionGroups.push(
            available
                .filter(parameter => (parameter[1] & NAMED) !== 0)
                .map(parameterNameCompletion),
        )
    }

    const positional = available.filter(parameter => (parameter[1] & POSITIONAL) !== 0)
    const positionalParameter = positional[Math.min(state.positional, positional.length - 1)]
    if (positionalParameter &&
        (state.positional < positional.length || (positionalParameter[1] & VARIADIC) !== 0)) {
        completionGroups.push(completionsForInput(positionalParameter[2]))
    }

    // At the beginning of a call, also surface values accepted by the first
    // configurable parameter. This makes `strike(` immediately offer colors
    // and `auto` alongside the named `stroke:` completion.
    if (state.first && site.signature[0]) {
        completionGroups.push(completionsForInput(site.signature[0][2]))
    }

    return {from: word.from, options: unique(...completionGroups)}
}

/**
 * CodeMirror completion source for Typst 0.15 built-ins.
 *
 * It is registered only by {@link typst_lezer}; the legacy WASM-backed
 * `typst()` support deliberately remains unchanged.
 */
export const typstCompletionSource: CompletionSource = (
    context: CompletionContext,
): CompletionResult | null => {
    const word = context.matchBefore(/[\p{ID_Continue}_-]*/u)
    if (!word) return null

    const node = syntaxTree(context.state).resolveInner(context.pos, -1)
    const property = propertyCompletion(context, node, word)
    if (property) return property

    const parameter = parameterCompletion(context, node, word)
    if (parameter) return parameter

    const afterHash = word.from > 0 && context.state.sliceDoc(word.from - 1, word.from) === "#"
    if (word.from === word.to && !context.explicit && !afterHash) return null

    const scope = completionScope(context, node, word.from)
    if (!scope) return null

    return {
        from: word.from,
        options: scope === "math" ? typstMathCompletions : typstGlobalCompletions,
        validFor: validIdentifier,
    }
}

export {typstBuiltinSignatures} from "./signatures"
export type {TypstBuiltinParameter} from "./signatures"
