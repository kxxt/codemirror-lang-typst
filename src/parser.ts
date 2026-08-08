import {
    Input,
    NodePropSource,
    NodeSet,
    NodeType,
    Parser,
    PartialParse,
    Tree,
    TreeFragment,
} from "@lezer/common"

/**
 * The node kinds exposed by `typst-syntax` 0.15.0, in discriminator order.
 *
 * Keeping these names and numeric ids aligned with Typst makes it possible for
 * clients to use the same syntax-tree vocabulary on the Rust and Lezer sides.
 */
export const typstSyntaxKinds = [
    "End", "Error", "Shebang", "LineComment", "BlockComment", "Markup",
    "Text", "Space", "Linebreak", "Parbreak", "Escape", "Shorthand",
    "SmartQuote", "Strong", "Emph", "Raw", "RawLang", "RawDelim",
    "RawTrimmed", "Link", "Label", "Ref", "RefMarker", "Heading",
    "HeadingMarker", "ListItem", "ListMarker", "EnumItem", "EnumMarker",
    "TermItem", "TermMarker", "Equation", "Math", "MathText", "MathIdent",
    "MathFieldAccess", "MathShorthand", "MathAlignPoint", "MathCall",
    "MathArgs", "MathDelimited", "MathAttach", "MathPrimes", "MathFrac",
    "MathRoot", "Hash", "LeftBrace", "RightBrace", "LeftBracket",
    "RightBracket", "LeftParen", "RightParen", "Comma", "Semicolon", "Colon",
    "Star", "Underscore", "Dollar", "Plus", "Minus", "Slash", "Hat", "Dot",
    "Eq", "EqEq", "ExclEq", "Lt", "LtEq", "Gt", "GtEq", "PlusEq", "HyphEq",
    "StarEq", "SlashEq", "Dots", "Arrow", "Root", "Bang", "Not", "And", "Or",
    "None", "Auto", "Let", "Set", "Show", "Context", "If", "Else", "For", "In",
    "While", "Break", "Continue", "Return", "Import", "Include", "As", "Code",
    "Ident", "Bool", "Int", "Float", "Numeric", "Str", "CodeBlock",
    "ContentBlock", "Parenthesized", "Array", "Dict", "Named", "Keyed", "Unary",
    "Binary", "FieldAccess", "FuncCall", "Args", "Spread", "Closure", "Params",
    "LetBinding", "SetRule", "ShowRule", "Contextual", "Conditional", "WhileLoop",
    "ForLoop", "ModuleImport", "ImportItems", "ImportItemPath",
    "RenamedImportItem", "ModuleInclude", "LoopBreak", "LoopContinue", "FuncReturn",
    "Destructuring", "DestructAssignment",
] as const

export type TypstSyntaxKind = typeof typstSyntaxKinds[number]
type Mode = "markup" | "math" | "code"
type NewlineMode =
    | {kind: "continue"}
    | {kind: "stop"}
    | {kind: "contextual"}
    | {kind: "parbreak"}
    | {kind: "column", column: number}

const CONTINUE: NewlineMode = {kind: "continue"}
const STOP: NewlineMode = {kind: "stop"}
const CONTEXTUAL: NewlineMode = {kind: "contextual"}
const STOP_PARBREAK: NewlineMode = {kind: "parbreak"}

const kindID: {[K in TypstSyntaxKind]: number} = Object.create(null)
for (let i = 0; i < typstSyntaxKinds.length; i++) kindID[typstSyntaxKinds[i]] = i + 1

const typstTopID = typstSyntaxKinds.length + 1

function makeNodeSet(props: readonly NodePropSource[] = []) {
    const types = [NodeType.none]
    for (let id = 1; id <= typstSyntaxKinds.length; id++) {
        const name = typstSyntaxKinds[id - 1]
        types.push(NodeType.define({id, name, error: name === "Error"}))
    }
    types.push(NodeType.define({id: typstTopID, name: "Typst", top: true}))
    return new NodeSet(types).extend(...props)
}

/** The default node set used by {@link typstParser}. */
export const typstNodeSet = makeNodeSet()

type Element = {
    kind: TypstSyntaxKind,
    from: number,
    to: number,
    children?: Element[],
}

type Newline = {column: number | null, parbreak: boolean}
type Token = {
    kind: TypstSyntaxKind,
    actualKind: TypstSyntaxKind,
    node: Element,
    nTrivia: number,
    newline: Newline | null,
    start: number,
    prevEnd: number,
}

const newlineRE = /[\n\v\f\r\u0085\u2028\u2029]/u
const idStartRE = /[\p{ID_Start}_]/u
const idContinueRE = /[\p{ID_Continue}_-]/u
const mathIDStartRE = /\p{ID_Start}/u
const mathIDContinueRE = /\p{ID_Continue}/u

function codePointAt(text: string, pos: number): string {
    const point = text.codePointAt(pos)
    return point == null ? "" : String.fromCodePoint(point)
}

function nextPos(text: string, pos: number) {
    const point = text.codePointAt(pos)
    return point == null ? pos : pos + (point > 0xffff ? 2 : 1)
}

function isNewline(ch: string) {
    return ch !== "" && newlineRE.test(ch)
}

function isIDStart(ch: string) {
    return ch !== "" && idStartRE.test(ch)
}

function isIDContinue(ch: string) {
    return ch !== "" && idContinueRE.test(ch)
}

function isMathIDStart(ch: string) {
    return ch !== "" && mathIDStartRE.test(ch)
}

function isMathIDContinue(ch: string) {
    return ch !== "" && ch !== "_" && mathIDContinueRE.test(ch)
}

function isWhitespace(ch: string, mode: Mode) {
    return mode === "markup" ? ch === " " || ch === "\t" || isNewline(ch) : /\s/u.test(ch)
}

function leaf(kind: TypstSyntaxKind, from: number, to: number): Element {
    return {kind, from, to}
}

function inner(kind: TypstSyntaxKind, children: Element[], fallback: number): Element {
    return {
        kind,
        from: children.length ? children[0].from : fallback,
        to: children.length ? children[children.length - 1].to : fallback,
        children,
    }
}

function countNewlines(text: string, from: number, to: number) {
    let count = 0
    for (let pos = from; pos < to;) {
        const ch = codePointAt(text, pos)
        pos = nextPos(text, pos)
        if (isNewline(ch)) {
            count++
            if (ch === "\r" && text.charCodeAt(pos) === 10) pos++
        }
    }
    return count
}

function lineColumn(text: string, pos: number) {
    let column = 0
    for (let at = pos; at > 0;) {
        const prev = text.charCodeAt(at - 1)
        if (prev === 10 || prev === 11 || prev === 12 || prev === 13 || prev === 0x85 ||
            prev === 0x2028 || prev === 0x2029) break
        at--
        // Low surrogates do not count as their own character.
        if (prev < 0xdc00 || prev > 0xdfff) column++
    }
    return column
}

function isTrivia(kind: TypstSyntaxKind) {
    return kind === "Shebang" || kind === "LineComment" || kind === "BlockComment" ||
        kind === "Space" || kind === "Parbreak"
}

class TypstLexer {
    pos = 0

    constructor(readonly text: string, public mode: Mode, readonly end = text.length) {}

    private at(value: string) {
        return this.text.startsWith(value, this.pos) && this.pos + value.length <= this.end
    }

    private eat(value: string) {
        if (!this.at(value)) return false
        this.pos += value.length
        return true
    }

    private eatWhile(test: (ch: string) => boolean) {
        const start = this.pos
        while (this.pos < this.end) {
            const ch = codePointAt(this.text, this.pos)
            if (!test(ch)) break
            this.pos = nextPos(this.text, this.pos)
        }
        return this.pos - start
    }

    next(): {kind: TypstSyntaxKind, node: Element, newline: boolean} {
        const start = this.pos
        if (start >= this.end) return {kind: "End", node: leaf("End", start, start), newline: false}

        const ch = codePointAt(this.text, this.pos)
        this.pos = nextPos(this.text, this.pos)

        if (isWhitespace(ch, this.mode)) {
            this.eatWhile(c => isWhitespace(c, this.mode))
            const newlines = countNewlines(this.text, start, this.pos)
            const kind = this.mode === "markup" && newlines >= 2 ? "Parbreak" : "Space"
            return {kind, node: leaf(kind, start, this.pos), newline: newlines > 0}
        }

        if (start === 0 && ch === "#" && this.eat("!")) {
            this.eatWhile(c => !isNewline(c))
            return {kind: "Shebang", node: leaf("Shebang", start, this.pos), newline: false}
        }

        if (ch === "/" && this.eat("/")) {
            this.eatWhile(c => !isNewline(c))
            return {kind: "LineComment", node: leaf("LineComment", start, this.pos), newline: false}
        }

        if (ch === "/" && this.eat("*")) {
            let depth = 1
            while (this.pos < this.end && depth) {
                if (this.eat("/*")) depth++
                else if (this.eat("*/")) depth--
                else this.pos = nextPos(this.text, this.pos)
            }
            return {
                // Typst keeps an unclosed block comment as a comment token;
                // diagnostics are attached separately in its syntax tree.
                kind: "BlockComment",
                node: leaf("BlockComment", start, this.pos),
                newline: countNewlines(this.text, start, this.pos) > 0,
            }
        }

        if (ch === "*" && this.eat("/")) {
            return {kind: "Error", node: leaf("Error", start, this.pos), newline: false}
        }

        if (ch === "`" && this.mode !== "math") return this.raw(start)

        const kind = this.mode === "markup" ? this.markup(start, ch)
            : this.mode === "math" ? this.math(start, ch)
                : this.code(start, ch)
        return {kind: kind.kind, node: kind.node ?? leaf(kind.kind, start, this.pos), newline: false}
    }

    private raw(start: number): {kind: TypstSyntaxKind, node: Element, newline: boolean} {
        let ticks = 1
        while (this.eat("`")) ticks++
        const openEnd = this.pos
        if (ticks === 2) {
            const children = [leaf("RawDelim", start, start + 1), leaf("RawDelim", start + 1, openEnd)]
            return {kind: "Raw", node: inner("Raw", children, start), newline: false}
        }

        const delimiter = "`".repeat(ticks)
        const close = this.text.indexOf(delimiter, this.pos)
        if (close < 0 || close + ticks > this.end) {
            this.pos = this.end
            return {kind: "Error", node: leaf("Error", start, this.pos), newline: false}
        }

        const children: Element[] = [leaf("RawDelim", start, openEnd)]
        let contentStart = openEnd
        if (ticks >= 3 && isIDStart(codePointAt(this.text, contentStart))) {
            let tagEnd = nextPos(this.text, contentStart)
            while (tagEnd < close && isIDContinue(codePointAt(this.text, tagEnd))) {
                tagEnd = nextPos(this.text, tagEnd)
            }
            children.push(leaf("RawLang", contentStart, tagEnd))
            contentStart = tagEnd
        }

        this.addRawContent(children, contentStart, close, ticks >= 3)
        children.push(leaf("RawDelim", close, close + ticks))
        this.pos = close + ticks
        return {kind: "Raw", node: inner("Raw", children, start), newline: false}
    }

    private addRawContent(children: Element[], from: number, to: number, block: boolean) {
        if (from === to) {
            children.push(leaf("Text", from, to))
            return
        }

        if (!block) {
            let pos = from, textStart = from
            while (pos < to) {
                const ch = codePointAt(this.text, pos)
                if (!isNewline(ch)) { pos = nextPos(this.text, pos); continue }
                children.push(leaf("Text", textStart, pos))
                const newline = pos
                pos = nextPos(this.text, pos)
                if (ch === "\r" && this.text.charCodeAt(pos) === 10) pos++
                children.push(leaf("RawTrimmed", newline, pos))
                textStart = pos
            }
            children.push(leaf("Text", textStart, to))
            return
        }

        type RawLine = {from: number, to: number}
        const lines: RawLine[] = []
        let lineFrom = from, pos = from
        while (pos < to) {
            const ch = codePointAt(this.text, pos)
            if (!isNewline(ch)) { pos = nextPos(this.text, pos); continue }
            const lineTo = pos
            pos = nextPos(this.text, pos)
            if (ch === "\r" && this.text.charCodeAt(pos) === 10) pos++
            lines.push({from: lineFrom, to: lineTo})
            lineFrom = pos
        }
        lines.push({from: lineFrom, to})

        const whitespaceOnly = (line: RawLine) =>
            /^\s*$/u.test(this.text.slice(line.from, line.to))
        const leadingChars = (line: RawLine) => {
            let count = 0
            for (let at = line.from; at < line.to;) {
                const ch = codePointAt(this.text, at)
                if (!/\s/u.test(ch)) break
                count++
                at = nextPos(this.text, at)
            }
            return count
        }
        const candidates = lines.slice(1).filter(line => !whitespaceOnly(line))
        if (lines.length) candidates.push(lines[lines.length - 1])
        const dedent = candidates.length ? Math.min(...candidates.map(leadingChars)) : 0

        const work = lines.slice()
        const last = work[work.length - 1]
        if (last && whitespaceOnly(last)) work.pop()
        else if (last) {
            const value = this.text.slice(last.from, last.to)
            if (value.trimEnd().endsWith("`") && value.endsWith(" ")) last.to--
        }

        let cursor = from
        const first = work.shift()
        if (first) {
            if (whitespaceOnly(first)) {
                // Keep the following newline pending. Typst merges the first
                // line's whitespace, that newline, and the next line's dedent
                // into one RawTrimmed node.
                cursor = first.to
            } else {
                if (this.text[cursor] === " ") {
                    children.push(leaf("RawTrimmed", cursor, ++cursor))
                }
                children.push(leaf("Text", cursor, first.to))
                cursor = first.to
            }
        }

        for (const line of work) {
            let content = line.from
            for (let count = 0; count < dedent && content < line.to; count++) {
                content = nextPos(this.text, content)
            }
            children.push(leaf("RawTrimmed", cursor, content))
            children.push(leaf("Text", content, line.to))
            cursor = line.to
        }
        if (cursor !== to) children.push(leaf("RawTrimmed", cursor, to))
    }

    private markup(start: number, ch: string): {kind: TypstSyntaxKind, node?: Element} {
        if (ch === "\\") return {kind: this.backslash()}
        if ((ch === "h" && (this.at("ttp://") || this.at("ttps://")))) return {kind: this.link()}
        if (ch === "<" && isIDContinue(codePointAt(this.text, this.pos))) return {kind: this.label()}
        if (ch === "@" && isIDContinue(codePointAt(this.text, this.pos))) return {kind: this.referenceMarker()}

        if (ch === "." && this.eat("..")) return {kind: "Shorthand"}
        if (ch === "-" && (this.eat("--") || this.eat("-") || this.eat("?"))) return {kind: "Shorthand"}
        if (ch === "-" && /\p{Number}/u.test(codePointAt(this.text, this.pos))) return {kind: "Shorthand"}
        if (ch === "*" && !this.inWord(start)) return {kind: "Star"}
        if (ch === "_" && !this.inWord(start)) return {kind: "Underscore"}

        if (ch === "#") return {kind: "Hash"}
        if (ch === "[") return {kind: "LeftBracket"}
        if (ch === "]") return {kind: "RightBracket"}
        if (ch === "'" || ch === "\"") return {kind: "SmartQuote"}
        if (ch === "$") return {kind: "Dollar"}
        if (ch === "~") return {kind: "Shorthand"}
        if (ch === ":") return {kind: "Colon"}
        if (ch === "=") {
            this.eatWhile(c => c === "=")
            if (this.spaceOrEnd()) return {kind: "HeadingMarker"}
            return {kind: this.textToken()}
        }
        if (ch === "-" && this.spaceOrEnd()) return {kind: "ListMarker"}
        if (ch === "+" && this.spaceOrEnd()) return {kind: "EnumMarker"}
        if (ch === "/" && this.spaceOrEnd()) return {kind: "TermMarker"}
        if (/[0-9]/.test(ch)) {
            this.eatWhile(c => /[0-9]/.test(c))
            if (this.eat(".") && this.spaceOrEnd()) return {kind: "EnumMarker"}
            return {kind: this.textToken()}
        }

        return {kind: this.textToken()}
    }

    private backslash(): TypstSyntaxKind {
        if (this.eat("u{")) {
            const from = this.pos
            this.eatWhile(c => /[0-9A-Za-z]/.test(c))
            const value = this.text.slice(from, this.pos)
            if (!this.eat("}")) return "Error"
            const point = Number.parseInt(value, 16)
            return value !== "" && Number.isFinite(point) && point <= 0x10ffff &&
                !(point >= 0xd800 && point <= 0xdfff) ? "Escape" : "Error"
        }
        if (this.pos >= this.end || /\s/u.test(codePointAt(this.text, this.pos))) return "Linebreak"
        this.pos = nextPos(this.text, this.pos)
        return "Escape"
    }

    private link(): TypstSyntaxKind {
        if (this.eat("ttp://")) { /* already consumed the h */ }
        else this.eat("ttps://")
        const stack: string[] = []
        const allowed = /[0-9A-Za-z!#$%&*+,\-./:;=?@_~']/
        while (this.pos < this.end) {
            const ch = this.text[this.pos]
            if (allowed.test(ch)) this.pos++
            else if (ch === "[" || ch === "(") { stack.push(ch); this.pos++ }
            else if (ch === "]" && stack[stack.length - 1] === "[") { stack.pop(); this.pos++ }
            else if (ch === ")" && stack[stack.length - 1] === "(") { stack.pop(); this.pos++ }
            else break
        }
        while (this.pos > 0 && /[!,. :;?']/.test(this.text[this.pos - 1])) this.pos--
        return stack.length ? "Error" : "Link"
    }

    private label(): TypstSyntaxKind {
        const from = this.pos
        this.eatWhile(c => isIDContinue(c) || c === ":" || c === ".")
        if (this.pos === from || !this.eat(">")) return "Error"
        return "Label"
    }

    private referenceMarker(): TypstSyntaxKind {
        this.eatWhile(c => isIDContinue(c) || c === ":" || c === ".")
        while (this.pos > 0 && (this.text[this.pos - 1] === "." || this.text[this.pos - 1] === ":")) this.pos--
        return "RefMarker"
    }

    private textToken(): TypstSyntaxKind {
        const special = /[ \t\n\v\f\r\\/[\]~\-.'"*_:h`$<>@#\u0085\u2028\u2029]/u
        while (this.pos < this.end) {
            const ch = codePointAt(this.text, this.pos)
            if (!special.test(ch) && !/\s/u.test(ch)) {
                this.pos = nextPos(this.text, this.pos)
                continue
            }
            if (ch === " " && /[\p{Letter}\p{Number}]/u.test(codePointAt(this.text, this.pos + 1)) ||
                ch === "/" && !this.text.startsWith("//", this.pos) && !this.text.startsWith("/*", this.pos) ||
                ch === "-" && this.text[this.pos + 1] !== "-" && this.text[this.pos + 1] !== "?" ||
                ch === "." && !this.text.startsWith("...", this.pos) ||
                ch === "h" && !this.text.startsWith("http://", this.pos) && !this.text.startsWith("https://", this.pos) ||
                ch === "@" && !isIDContinue(codePointAt(this.text, this.pos + 1))) {
                this.pos = nextPos(this.text, this.pos)
                continue
            }
            break
        }
        return "Text"
    }

    private inWord(start: number) {
        const before = start > 0 ? codePointAt(this.text, start - (this.text.charCodeAt(start - 1) >= 0xdc00 &&
            this.text.charCodeAt(start - 1) <= 0xdfff ? 2 : 1)) : ""
        const after = codePointAt(this.text, this.pos)
        const wordy = (ch: string) => /[\p{Letter}\p{Number}]/u.test(ch) &&
            !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch)
        return wordy(before) && wordy(after)
    }

    private spaceOrEnd() {
        return this.pos >= this.end || /\s/u.test(codePointAt(this.text, this.pos)) ||
            this.at("//") || this.at("/*")
    }

    private math(start: number, ch: string): {kind: TypstSyntaxKind, node?: Element} {
        if (ch === "\\") return {kind: this.backslash()}
        if (ch === "\"") return {kind: this.string()}

        const shorthand = ["->>", "->", "-->", ":=", "::=", "!=", "...", "<==>", "<-->",
            "<--", "<-<", "<->", "<<-", "<<<", "<=>", "<==", "<~~", "<=", "<<", "<-", "<~",
            ">->", ">>>", "==>", "=>", "=:", ">=", ">>", "|->", "|=>", "||", "~~>", "~>"]
        for (const rest of shorthand) {
            if ((ch + this.text.slice(this.pos, this.pos + rest.length - 1)) === rest) {
                this.pos += rest.length - 1
                return {kind: "MathShorthand"}
            }
        }
        if (ch === "*" || ch === "-" || ch === "~") return {kind: "MathShorthand"}
        const simple: {[ch: string]: TypstSyntaxKind} = {
            ".": "Dot", ",": "Comma", ";": "Semicolon", "#": "Hash", "_": "Underscore",
            "$": "Dollar", "/": "Slash", "^": "Hat", "&": "MathAlignPoint", "!": "Bang",
            "√": "Root", "∛": "Root", "∜": "Root",
        }
        if (simple[ch]) return {kind: simple[ch]}
        if (ch === "'") { this.eatWhile(c => c === "'"); return {kind: "MathPrimes"} }
        if (ch === "(") return {kind: "LeftParen"}
        if (ch === ")") return {kind: "RightParen"}
        if (ch === "[" && this.eat("|")) return {kind: "LeftBrace"}
        if (ch === "|" && this.eat("]")) return {kind: "RightBrace"}
        if ("[{⟨⌈⌊❨❪❬❮❰❲⟦⟬⦃⦅⦇⦉⦋⦍⦏⦑⦗".includes(ch)) return {kind: "LeftBrace"}
        if ("]}⟩⌉⌋❩❫❭❯❱❳⟧⟭⦄⦆⦈⦊⦌⦎⦐⦒⦘".includes(ch)) return {kind: "RightBrace"}

        if (isMathIDStart(ch) && isMathIDContinue(codePointAt(this.text, this.pos))) {
            this.eatWhile(isMathIDContinue)
            const baseEnd = this.pos
            const base = leaf("MathIdent", start, baseEnd)
            let node = base
            let kind: TypstSyntaxKind = "MathIdent"
            while (this.text[this.pos] === "." && isMathIDStart(codePointAt(this.text, this.pos + 1))) {
                const dot = this.pos++
                const ident = this.pos
                this.pos = nextPos(this.text, this.pos)
                this.eatWhile(isMathIDContinue)
                kind = "MathFieldAccess"
                node = inner(kind, [node, leaf("Dot", dot, dot + 1), leaf("MathIdent", ident, this.pos)], start)
            }
            return {kind, node}
        }

        if (/\p{Number}/u.test(ch)) {
            this.eatWhile(c => /\p{Number}/u.test(c))
            if (this.text[this.pos] === "." && /\p{Number}/u.test(codePointAt(this.text, this.pos + 1))) {
                this.pos++
                this.eatWhile(c => /\p{Number}/u.test(c))
            }
        } else {
            // Keep combining marks with their base character.
            this.eatWhile(c => /\p{Mark}/u.test(c))
        }
        return {kind: "MathText"}
    }

    private code(start: number, ch: string): {kind: TypstSyntaxKind, node?: Element} {
        if (ch === "<" && isIDContinue(codePointAt(this.text, this.pos))) return {kind: this.label()}
        if (/[0-9]/.test(ch) || ch === "." && /[0-9]/.test(this.text[this.pos] ?? "")) {
            return {kind: this.number(ch)}
        }
        if (ch === "\"") return {kind: this.string()}

        const pairs: {[text: string]: TypstSyntaxKind} = {
            "==": "EqEq", "!=": "ExclEq", "<=": "LtEq", ">=": "GtEq", "+=": "PlusEq",
            "-=": "HyphEq", "−=": "HyphEq", "*=": "StarEq", "/=": "SlashEq", "..": "Dots",
            "=>": "Arrow",
        }
        const pair = ch + (this.text[this.pos] ?? "")
        if (pairs[pair]) { this.pos++; return {kind: pairs[pair]} }

        const simple: {[ch: string]: TypstSyntaxKind} = {
            "{": "LeftBrace", "}": "RightBrace", "[": "LeftBracket", "]": "RightBracket",
            "(": "LeftParen", ")": "RightParen", "$": "Dollar", ",": "Comma", ";": "Semicolon",
            ":": "Colon", ".": "Dot", "+": "Plus", "-": "Minus", "−": "Minus", "*": "Star",
            "/": "Slash", "=": "Eq", "<": "Lt", ">": "Gt",
        }
        if (simple[ch]) return {kind: simple[ch]}
        if (isIDStart(ch)) return {kind: this.identifier(start)}

        if (ch === "&" && this.eat("&") || ch === "|" && this.eat("|") ||
            ch === "~" && this.eat("=")) { /* consume common mistyped operators */ }
        return {kind: "Error"}
    }

    private identifier(start: number): TypstSyntaxKind {
        this.eatWhile(isIDContinue)
        const ident = this.text.slice(start, this.pos)
        const keywords: {[word: string]: TypstSyntaxKind} = {
            none: "None", auto: "Auto", true: "Bool", false: "Bool", not: "Not", and: "And",
            or: "Or", let: "Let", set: "Set", show: "Show", context: "Context", if: "If",
            else: "Else", for: "For", in: "In", while: "While", break: "Break",
            continue: "Continue", return: "Return", import: "Import", include: "Include", as: "As",
        }
        const prev = this.text.slice(0, start)
        if ((!prev.endsWith(".") && !prev.endsWith("@") || prev.endsWith("..")) && keywords[ident]) {
            return keywords[ident]
        }
        return ident === "_" ? "Underscore" : "Ident"
    }

    private number(first: string): TypstSyntaxKind {
        let base = 10
        if (first === "0" && this.pos < this.end) {
            const prefix = this.text[this.pos]
            if (prefix === "b" || prefix === "o" || prefix === "x") {
                base = prefix === "b" ? 2 : prefix === "o" ? 8 : 16
                this.pos++
            }
        }
        this.eatWhile(c => base === 16 ? /[0-9A-Za-z]/.test(c) : /[0-9]/.test(c))
        let floating = first === "."
        if (base === 10 && first !== "." && !this.at("..") &&
            !(this.text[this.pos] === "." && isIDStart(codePointAt(this.text, this.pos + 1))) && this.eat(".")) {
            floating = true
            this.eatWhile(c => /[0-9]/.test(c))
        }
        if (base === 10 && !this.at("em") && (this.text[this.pos] === "e" || this.text[this.pos] === "E")) {
            floating = true
            this.pos++
            if (this.text[this.pos] === "+" || this.text[this.pos] === "-") this.pos++
            this.eatWhile(c => /[0-9]/.test(c))
        }
        const suffixStart = this.pos
        this.eatWhile(c => /[0-9A-Za-z%]/.test(c))
        const suffix = this.text.slice(suffixStart, this.pos)
        if (suffix) return ["pt", "mm", "cm", "in", "deg", "rad", "em", "fr", "%"].includes(suffix) &&
            base === 10 ? "Numeric" : "Error"
        return floating ? "Float" : "Int"
    }

    private string(): TypstSyntaxKind {
        let escaped = false
        while (this.pos < this.end) {
            const ch = this.text[this.pos++]
            if (ch === "\"" && !escaped) return "Str"
            if (ch === "\\" && !escaped) escaped = true
            else escaped = false
        }
        return "Error"
    }
}

type ParserSnapshot = {
    pos: number,
    mode: Mode,
    nlMode: NewlineMode,
    token: Token,
    nodes: Element[],
}

class TypstCSTParser {
    readonly lexer: TypstLexer
    private token: Token
    private nodes: Element[] = []
    private nlMode: NewlineMode = CONTINUE
    private depth = 0

    constructor(readonly text: string, readonly end = text.length) {
        this.lexer = new TypstLexer(text, "markup", end)
        this.token = this.lex()
    }

    parseDocument() {
        this.parseMarkupExpressions(new Set(["End"]), true)
        return this.nodes
    }

    private lex(): Token {
        const prevEnd = this.lexer.pos
        let start = prevEnd
        let result = this.lexer.next()
        let nTrivia = 0
        let hadNewline = false
        let parbreak = false
        while (isTrivia(result.kind)) {
            hadNewline ||= result.newline
            parbreak ||= result.kind === "Parbreak"
            this.nodes.push(result.node)
            nTrivia++
            start = this.lexer.pos
            result = this.lexer.next()
        }
        const newline = hadNewline ? {
            column: this.lexer.mode === "markup" ? lineColumn(this.text, start) : null,
            parbreak,
        } : null
        const actualKind = result.kind
        return {
            kind: newline && this.stopAtNewline(this.nlMode, newline, actualKind) ? "End" : actualKind,
            actualKind,
            node: result.node,
            nTrivia,
            newline,
            start,
            prevEnd,
        }
    }

    private stopAtNewline(mode: NewlineMode, newline: Newline, kind: TypstSyntaxKind) {
        switch (mode.kind) {
            case "continue": return false
            case "stop": return true
            case "contextual": return kind !== "Else" && kind !== "Dot"
            case "parbreak": return newline.parbreak
            case "column": return newline.column != null && newline.column <= mode.column
        }
    }

    private get current() { return this.token.kind }
    private get actual() { return this.token.actualKind }
    private get start() { return this.token.start }
    private get tokenEnd() { return this.token.node.to }
    private get tokenText() { return this.text.slice(this.start, this.tokenEnd) }
    private get hadTrivia() { return this.token.nTrivia > 0 }
    private get directly() { return this.token.nTrivia === 0 }
    private marker() { return this.nodes.length }
    private beforeTrivia() { return this.nodes.length - this.token.nTrivia }
    private at(kind: TypstSyntaxKind) { return this.token.kind === kind }

    private eat(kind?: TypstSyntaxKind) {
        if (kind && this.current !== kind) return false
        this.nodes.push(this.token.node)
        this.token = this.lex()
        return true
    }

    private eatAs(kind: TypstSyntaxKind) {
        this.token.node = {...this.token.node, kind}
        this.token.actualKind = kind
        this.token.kind = kind
        this.eat()
    }

    private eatIf(kind: TypstSyntaxKind) {
        return this.current === kind && this.eat()
    }

    private expect(kind: TypstSyntaxKind) {
        if (this.eatIf(kind)) return true
        this.insertError()
        return false
    }

    private expectClosing(open: number, kind: TypstSyntaxKind) {
        if (this.eatIf(kind)) return true
        const node = this.nodes[open]
        if (node) this.nodes[open] = leaf("Error", node.from, node.to)
        else this.insertError()
        return false
    }

    private insertError(at = this.token.prevEnd) {
        this.nodes.splice(this.beforeTrivia(), 0, leaf("Error", at, at))
    }

    private unexpected() {
        if (this.current === "End") {
            this.insertError()
            return
        }
        this.eatAs("Error")
    }

    private wrap(from: number, kind: TypstSyntaxKind) {
        const to = this.beforeTrivia()
        const actualFrom = Math.min(from, to)
        const children = this.nodes.splice(actualFrom, to - actualFrom)
        this.nodes.splice(actualFrom, 0, inner(kind, children, this.token.prevEnd))
    }

    private flushTrivia() {
        this.token.nTrivia = 0
        this.token.prevEnd = this.token.start
    }

    private withNewlineMode(mode: NewlineMode, parse: () => void) {
        const previous = this.nlMode
        this.nlMode = mode
        parse()
        this.nlMode = previous
        if (this.token.newline) {
            this.token.kind = this.stopAtNewline(previous, this.token.newline, this.actual)
                ? "End" : this.actual
        }
    }

    private enterMode(mode: Mode, newlineMode: NewlineMode, parse: () => void) {
        const previous = this.lexer.mode
        this.lexer.mode = mode
        this.withNewlineMode(newlineMode, parse)
        if (previous !== mode) {
            this.lexer.mode = previous
            this.lexer.pos = this.token.prevEnd
            this.nodes.splice(this.nodes.length - this.token.nTrivia, this.token.nTrivia)
            this.token = this.lex()
        }
    }

    private snapshot(): ParserSnapshot {
        return {
            pos: this.lexer.pos,
            mode: this.lexer.mode,
            nlMode: this.nlMode,
            token: {...this.token, node: {...this.token.node}},
            nodes: this.nodes.slice(),
        }
    }

    private restore(snapshot: ParserSnapshot) {
        this.lexer.pos = snapshot.pos
        this.lexer.mode = snapshot.mode
        this.nlMode = snapshot.nlMode
        this.token = snapshot.token
        this.nodes = snapshot.nodes
    }

    // Markup -----------------------------------------------------------------

    private parseMarkupExpressions(stop: ReadonlySet<TypstSyntaxKind>, atStart: boolean) {
        if (++this.depth > 256) {
            this.depth--
            this.unexpected()
            return
        }
        let lineStart = atStart || this.token.newline != null
        let brackets = 0
        while (!stop.has(this.current) || brackets > 0 && this.current === "RightBracket") {
            const was = this.start
            this.parseMarkupExpression(lineStart, {get value() { return brackets }, set value(v) { brackets = v }})
            lineStart = this.token.newline != null
            if (this.start === was && this.current !== "End") this.unexpected()
            if (this.current === "End" && !stop.has("End")) break
        }
        this.depth--
    }

    private parseMarkup(
        stop: ReadonlySet<TypstSyntaxKind>,
        atStart: boolean,
        wrapTrivia: boolean,
    ) {
        const mark = wrapTrivia ? this.beforeTrivia() : this.marker()
        this.parseMarkupExpressions(stop, atStart)
        if (wrapTrivia) this.flushTrivia()
        this.wrap(mark, "Markup")
    }

    private parseMarkupExpression(
        atStart: boolean,
        brackets: {value: number},
    ) {
        switch (this.current) {
            case "LeftBracket":
                brackets.value++
                this.eatAs("Text")
                return
            case "RightBracket":
                if (brackets.value > 0) {
                    brackets.value--
                    this.eatAs("Text")
                } else this.unexpected()
                return
            case "Shebang": case "Text": case "Linebreak": case "Escape": case "Shorthand":
            case "SmartQuote": case "Link": case "Label": case "Raw":
                this.eat()
                return
            case "Hash": this.embeddedCodeExpression(); return
            case "Star": this.strong(); return
            case "Underscore": this.emphasis(); return
            case "HeadingMarker":
                if (atStart) this.heading()
                else this.eatAs("Text")
                return
            case "ListMarker":
                if (atStart) this.listItem()
                else this.eatAs("Text")
                return
            case "EnumMarker":
                if (atStart) this.enumItem()
                else this.eatAs("Text")
                return
            case "TermMarker":
                if (atStart) this.termItem()
                else this.eatAs("Text")
                return
            case "RefMarker": this.reference(); return
            case "Dollar": this.equation(); return
            case "Colon": this.eatAs("Text"); return
            default: this.unexpected()
        }
    }

    private strong() {
        this.withNewlineMode(STOP_PARBREAK, () => {
            const mark = this.marker()
            this.eat("Star")
            this.parseMarkup(new Set(["Star", "RightBracket", "End"]), false, true)
            this.expectClosing(mark, "Star")
            this.wrap(mark, "Strong")
        })
    }

    private emphasis() {
        this.withNewlineMode(STOP_PARBREAK, () => {
            const mark = this.marker()
            this.eat("Underscore")
            this.parseMarkup(new Set(["Underscore", "RightBracket", "End"]), false, true)
            this.expectClosing(mark, "Underscore")
            this.wrap(mark, "Emph")
        })
    }

    private heading() {
        this.withNewlineMode(STOP, () => {
            const mark = this.marker()
            this.eat("HeadingMarker")
            this.parseMarkup(new Set(["Label", "RightBracket", "End"]), false, false)
            this.wrap(mark, "Heading")
        })
    }

    private listItem() {
        const column = lineColumn(this.text, this.start)
        this.withNewlineMode({kind: "column", column}, () => {
            const mark = this.marker()
            this.eat("ListMarker")
            this.parseMarkup(new Set(["RightBracket", "End"]), true, false)
            this.wrap(mark, "ListItem")
        })
    }

    private enumItem() {
        const column = lineColumn(this.text, this.start)
        this.withNewlineMode({kind: "column", column}, () => {
            const mark = this.marker()
            this.eat("EnumMarker")
            this.parseMarkup(new Set(["RightBracket", "End"]), true, false)
            this.wrap(mark, "EnumItem")
        })
    }

    private termItem() {
        const column = lineColumn(this.text, this.start)
        this.withNewlineMode({kind: "column", column}, () => {
            const mark = this.marker()
            this.withNewlineMode(STOP, () => {
                this.eat("TermMarker")
                this.parseMarkup(new Set(["Colon", "RightBracket", "End"]), false, false)
            })
            this.expect("Colon")
            this.parseMarkup(new Set(["RightBracket", "End"]), true, false)
            this.wrap(mark, "TermItem")
        })
    }

    private reference() {
        const mark = this.marker()
        this.eat("RefMarker")
        if (this.current === "LeftBracket" && this.directly) this.contentBlock()
        this.wrap(mark, "Ref")
    }

    private contentBlock() {
        const mark = this.marker()
        this.enterMode("markup", CONTINUE, () => {
            this.expect("LeftBracket")
            this.parseMarkup(new Set(["RightBracket", "End"]), true, true)
            this.expectClosing(mark, "RightBracket")
        })
        this.wrap(mark, "ContentBlock")
    }

    private equation() {
        const mark = this.marker()
        this.enterMode("math", CONTINUE, () => {
            this.expect("Dollar")
            const math = this.marker()
            this.mathExpressions(new Set(["Dollar", "End"]))
            this.wrap(math, "Math")
            this.expectClosing(mark, "Dollar")
        })
        this.wrap(mark, "Equation")
    }

    // Code -------------------------------------------------------------------

    private codeExpressions(stop: ReadonlySet<TypstSyntaxKind>) {
        if (++this.depth > 256) {
            this.depth--
            this.unexpected()
            return
        }
        while (!stop.has(this.current)) {
            const start = this.start
            this.withNewlineMode(CONTEXTUAL, () => {
                if (!this.canStartCodeExpression(this.current)) {
                    this.unexpected()
                    return
                }
                const statement = this.isStatement(this.current)
                this.codeExpression()
                if (!stop.has(this.current) && !this.eatIf("Semicolon") && !this.at("End")) {
                    this.insertError()
                }
                // Statements can be followed by an explicit semicolon even at
                // the end of a line.
                if (statement && this.at("Semicolon")) this.eat()
            })
            if (this.start === start && !stop.has(this.current)) this.unexpected()
        }
        this.depth--
    }

    private codeBlock() {
        const mark = this.marker()
        this.enterMode("code", CONTINUE, () => {
            this.expect("LeftBrace")
            const code = this.marker()
            this.codeExpressions(new Set(["RightBrace", "RightBracket", "RightParen", "End"]))
            this.wrap(code, "Code")
            this.expectClosing(mark, "RightBrace")
        })
        this.wrap(mark, "CodeBlock")
    }

    private embeddedCodeExpression() {
        this.enterMode("code", STOP, () => {
            this.expect("Hash")
            if (this.hadTrivia || this.current === "End") {
                this.insertError()
                return
            }
            const statement = this.isStatement(this.current)
            this.codeExpressionPrec(true, 0)
            if ((statement || this.at("Semicolon") && this.directly) && this.at("Semicolon")) {
                this.eat()
            } else if (statement && !this.at("End") && !this.at("RightBracket")) {
                this.insertError()
            }
        })
    }

    private codeExpression() {
        this.codeExpressionPrec(false, 0)
    }

    private codeExpressionPrec(atomic: boolean, minPrecedence: number) {
        if (++this.depth > 256) {
            this.depth--
            this.unexpected()
            return
        }
        const mark = this.marker()
        if (this.isUnary(this.current)) {
            if (atomic) this.unexpected()
            else {
                const precedence = this.current === "Not" ? 4 : 7
                this.eat()
                this.codeExpressionPrec(false, precedence)
                this.wrap(mark, "Unary")
            }
        } else {
            this.codePrimary(atomic)
        }

        for (;;) {
            if (this.directly && (this.current === "LeftParen" || this.current === "LeftBracket")) {
                this.arguments()
                this.wrap(mark, "FuncCall")
                continue
            }

            const field = this.directly && this.current === "Dot" &&
                isIDStart(codePointAt(this.text, this.tokenEnd))
            if (atomic && !field) break
            if (this.current === "Dot") {
                this.eat()
                this.expect("Ident")
                this.wrap(mark, "FieldAccess")
                continue
            }

            let operator = this.current
            let notIn = false
            if (operator === "Not" && minPrecedence <= 4) {
                const snapshot = this.snapshot()
                this.eat()
                if (this.current === "In") {
                    notIn = true
                    operator = "In"
                } else {
                    this.restore(snapshot)
                    break
                }
            }
            const info = this.binaryPrecedence(operator)
            if (!info || info.precedence < minPrecedence) break
            if (!notIn) this.eat()
            else this.eat("In")
            this.codeExpressionPrec(false, info.right ? info.precedence : info.precedence + 1)
            this.wrap(mark, "Binary")
        }
        this.depth--
    }

    private codePrimary(atomic: boolean) {
        const mark = this.marker()
        switch (this.current) {
            case "Ident":
                this.eat()
                if (!atomic && this.at("Arrow")) {
                    this.wrap(mark, "Params")
                    this.eat()
                    this.codeExpression()
                    this.wrap(mark, "Closure")
                }
                return
            case "Underscore":
                if (atomic) { this.unexpected(); return }
                this.eat()
                if (this.at("Arrow")) {
                    this.wrap(mark, "Params")
                    this.eat()
                    this.codeExpression()
                    this.wrap(mark, "Closure")
                } else if (this.eatIf("Eq")) {
                    this.codeExpression()
                    this.wrap(mark, "DestructAssignment")
                } else this.wrap(mark, "Error")
                return
            case "LeftBrace": this.codeBlock(); return
            case "LeftBracket": this.contentBlock(); return
            case "LeftParen": this.expressionWithParen(atomic); return
            case "Dollar": this.equation(); return
            case "Let": this.letBinding(); return
            case "Set": this.setRule(); return
            case "Show": this.showRule(); return
            case "Context": this.contextual(atomic); return
            case "If": this.conditional(); return
            case "While": this.whileLoop(); return
            case "For": this.forLoop(); return
            case "Import": this.moduleImport(); return
            case "Include": this.moduleInclude(); return
            case "Break": this.wrappedLeaf("LoopBreak"); return
            case "Continue": this.wrappedLeaf("LoopContinue"); return
            case "Return": this.returnStatement(); return
            case "Raw": case "None": case "Auto": case "Int": case "Float": case "Bool":
            case "Numeric": case "Str": case "Label":
                this.eat()
                return
            default:
                if (atomic) this.unexpected()
                else this.insertError()
        }
    }

    private expressionWithParen(atomic: boolean) {
        if (atomic) {
            this.parenthesizedArrayOrDict()
            return
        }
        const snapshot = this.snapshot()
        const kind = this.parenthesizedArrayOrDict()
        if (this.current === "Arrow") {
            this.restore(snapshot)
            const mark = this.marker()
            this.parameters()
            this.expect("Arrow")
            this.codeExpression()
            this.wrap(mark, "Closure")
        } else if (this.current === "Eq" && kind !== "Parenthesized") {
            this.restore(snapshot)
            const mark = this.marker()
            this.destructuringPattern()
            this.expect("Eq")
            this.codeExpression()
            this.wrap(mark, "DestructAssignment")
        }
    }

    private parenthesizedArrayOrDict(): "Parenthesized" | "Array" | "Dict" {
        const mark = this.marker()
        let count = 0
        let maybeParens = true
        let group: "Array" | "Dict" | null = null
        this.withNewlineMode(CONTINUE, () => {
            this.expect("LeftParen")
            if (this.eatIf("Colon")) group = "Dict"
            while (!this.isTerminator(this.current)) {
                const before = this.start
                const item = this.marker()
                if (this.eatIf("Dots")) {
                    this.codeExpression()
                    this.wrap(item, "Spread")
                    maybeParens = false
                } else if (this.canStartCodeExpression(this.current)) {
                    const first = this.marker()
                    this.codeExpression()
                    if (this.eatIf("Colon")) {
                        this.codeExpression()
                        const firstNode = this.nodes[first]
                        this.wrap(item, firstNode?.kind === "Ident" ? "Named" : "Keyed")
                        group = "Dict"
                        maybeParens = false
                    } else if (group !== "Dict") group = "Array"
                } else this.unexpected()
                count++
                if (!this.isTerminator(this.current)) {
                    if (this.expect("Comma")) maybeParens = false
                }
                if (this.start === before && !this.isTerminator(this.current)) this.unexpected()
            }
            this.expectClosing(mark, "RightParen")
        })
        const kind = maybeParens && count === 1 ? "Parenthesized" : group ?? "Array"
        this.wrap(mark, kind)
        return kind
    }

    private arguments() {
        const mark = this.marker()
        const startsArguments = this.current === "LeftParen" || this.current === "LeftBracket"
        if (!startsArguments || !this.directly) this.insertError()
        if (this.current === "LeftParen") {
            this.withNewlineMode(CONTINUE, () => {
                const open = this.marker()
                this.eat()
                while (!this.isTerminator(this.current)) {
                    const before = this.start
                    this.argument()
                    if (!this.isTerminator(this.current)) this.expect("Comma")
                    if (this.start === before && !this.isTerminator(this.current)) this.unexpected()
                }
                this.expectClosing(open, "RightParen")
            })
        }
        while (this.current === "LeftBracket" && this.directly) this.contentBlock()
        this.wrap(mark, "Args")
    }

    private argument() {
        const mark = this.marker()
        if (this.eatIf("Dots")) {
            this.codeExpression()
            this.wrap(mark, "Spread")
            return
        }
        if (!this.canStartCodeExpression(this.current)) {
            this.unexpected()
            return
        }
        this.codeExpression()
        if (this.eatIf("Colon")) {
            this.codeExpression()
            this.wrap(mark, "Named")
        }
    }

    private parameters() {
        const mark = this.marker()
        this.withNewlineMode(CONTINUE, () => {
            this.expect("LeftParen")
            while (!this.isTerminator(this.current)) {
                const before = this.start
                const param = this.marker()
                if (this.eatIf("Dots")) {
                    if (this.canStartPattern(this.current)) this.pattern()
                    this.wrap(param, "Spread")
                } else {
                    this.pattern()
                    if (this.eatIf("Colon")) {
                        this.codeExpression()
                        this.wrap(param, "Named")
                    }
                }
                if (!this.isTerminator(this.current)) this.expect("Comma")
                if (this.start === before && !this.isTerminator(this.current)) this.unexpected()
            }
            this.expectClosing(mark, "RightParen")
        })
        this.wrap(mark, "Params")
    }

    private pattern() {
        if (this.current === "Underscore") {
            this.eat()
        } else if (this.current === "LeftParen") {
            this.destructuringPattern()
        } else if (this.isKeyword(this.current)) {
            this.eatAs("Error")
        } else if (this.canStartPattern(this.current)) {
            const mark = this.marker()
            this.codeExpressionPrec(true, 0)
            const node = this.nodes[mark]
            if (node && node.kind !== "Ident") this.nodes[mark] = leaf("Error", node.from, node.to)
        } else {
            this.insertError()
        }
    }

    private destructuringPattern() {
        const mark = this.marker()
        let count = 0, destructuring = false
        this.withNewlineMode(CONTINUE, () => {
            this.expect("LeftParen")
            while (!this.isTerminator(this.current)) {
                const before = this.start
                const item = this.marker()
                if (this.eatIf("Dots")) {
                    if (this.canStartPattern(this.current)) this.pattern()
                    this.wrap(item, "Spread")
                    destructuring = true
                } else {
                    this.pattern()
                    if (this.eatIf("Colon")) {
                        this.pattern()
                        this.wrap(item, "Named")
                        destructuring = true
                    }
                }
                count++
                if (!this.isTerminator(this.current)) {
                    this.expect("Comma")
                    destructuring = true
                }
                if (this.start === before && !this.isTerminator(this.current)) this.unexpected()
            }
            this.expectClosing(mark, "RightParen")
        })
        this.wrap(mark, destructuring || count !== 1 ? "Destructuring" : "Parenthesized")
    }

    private letBinding() {
        const mark = this.marker()
        this.eat("Let")
        const binding = this.marker()
        let closure = false
        if (this.eatIf("Ident")) {
            if (this.current === "LeftParen" && this.directly) {
                this.parameters()
                closure = true
            }
        } else this.pattern()
        if (this.eatIf("Eq")) this.codeExpression()
        else if (closure) this.insertError()
        if (closure) this.wrap(binding, "Closure")
        this.wrap(mark, "LetBinding")
    }

    private setRule() {
        const mark = this.marker()
        this.eat("Set")
        const target = this.marker()
        this.expect("Ident")
        while (this.eatIf("Dot")) {
            this.expect("Ident")
            this.wrap(target, "FieldAccess")
        }
        this.arguments()
        if (this.eatIf("If")) this.codeExpression()
        this.wrap(mark, "SetRule")
    }

    private showRule() {
        const mark = this.marker()
        this.eat("Show")
        if (this.current !== "Colon") this.codeExpression()
        if (this.eatIf("Colon")) this.codeExpression()
        else this.insertError()
        this.wrap(mark, "ShowRule")
    }

    private contextual(atomic: boolean) {
        const mark = this.marker()
        this.eat("Context")
        this.codeExpressionPrec(atomic, 0)
        this.wrap(mark, "Contextual")
    }

    private conditional() {
        const mark = this.marker()
        this.eat("If")
        this.codeExpression()
        this.block()
        if (this.eatIf("Else")) {
            if (this.current === "If") this.conditional()
            else this.block()
        }
        this.wrap(mark, "Conditional")
    }

    private whileLoop() {
        const mark = this.marker()
        this.eat("While")
        this.codeExpression()
        this.block()
        this.wrap(mark, "WhileLoop")
    }

    private forLoop() {
        const mark = this.marker()
        this.eat("For")
        this.pattern()
        if (this.eatIf("Comma")) this.pattern()
        this.expect("In")
        this.codeExpression()
        this.block()
        this.wrap(mark, "ForLoop")
    }

    private block() {
        if (this.current === "LeftBrace") this.codeBlock()
        else if (this.current === "LeftBracket") this.contentBlock()
        else this.insertError()
    }

    private moduleImport() {
        const mark = this.marker()
        this.eat("Import")
        this.codeExpression()
        if (this.eatIf("As")) this.expect("Ident")
        if (this.eatIf("Colon")) {
            if (this.current === "LeftParen") {
                this.withNewlineMode(CONTINUE, () => {
                    const open = this.marker()
                    this.eat()
                    this.importItems()
                    this.expectClosing(open, "RightParen")
                })
            } else if (!this.eatIf("Star")) this.importItems()
        }
        this.wrap(mark, "ModuleImport")
    }

    private importItems() {
        const mark = this.marker()
        while (!this.isTerminator(this.current)) {
            const before = this.start
            const item = this.marker()
            this.expect("Ident")
            while (this.eatIf("Dot")) this.expect("Ident")
            this.wrap(item, "ImportItemPath")
            if (this.eatIf("As")) {
                this.expect("Ident")
                this.wrap(item, "RenamedImportItem")
            }
            if (!this.isTerminator(this.current)) this.expect("Comma")
            if (this.start === before && !this.isTerminator(this.current)) this.unexpected()
        }
        this.wrap(mark, "ImportItems")
    }

    private moduleInclude() {
        const mark = this.marker()
        this.eat("Include")
        this.codeExpression()
        this.wrap(mark, "ModuleInclude")
    }

    private returnStatement() {
        const mark = this.marker()
        this.eat("Return")
        if (this.canStartCodeExpression(this.current)) this.codeExpression()
        this.wrap(mark, "FuncReturn")
    }

    private wrappedLeaf(kind: "LoopBreak" | "LoopContinue") {
        const mark = this.marker()
        this.eat()
        this.wrap(mark, kind)
    }

    private isStatement(kind: TypstSyntaxKind): boolean {
        return kind === "Let" || kind === "Set" || kind === "Show" || kind === "Import" ||
            kind === "Include" || kind === "Return"
    }

    private isUnary(kind: TypstSyntaxKind): boolean {
        return kind === "Plus" || kind === "Minus" || kind === "Not"
    }

    private isKeyword(kind: TypstSyntaxKind): boolean {
        return kind === "Not" || kind === "And" || kind === "Or" || kind === "None" ||
            kind === "Auto" || kind === "Let" || kind === "Set" || kind === "Show" ||
            kind === "Context" || kind === "If" || kind === "Else" || kind === "For" ||
            kind === "In" || kind === "While" || kind === "Break" || kind === "Continue" ||
            kind === "Return" || kind === "Import" || kind === "Include" || kind === "As"
    }

    private canStartCodeExpression(kind: TypstSyntaxKind): boolean {
        return kind === "Ident" || kind === "LeftBrace" || kind === "LeftBracket" ||
            kind === "LeftParen" || kind === "Dollar" || kind === "Let" || kind === "Set" ||
            kind === "Show" || kind === "Context" || kind === "If" || kind === "While" ||
            kind === "For" || kind === "Import" || kind === "Include" || kind === "Break" ||
            kind === "Continue" || kind === "Return" || kind === "None" || kind === "Auto" ||
            kind === "Int" || kind === "Float" || kind === "Bool" || kind === "Numeric" ||
            kind === "Str" || kind === "Label" || kind === "Raw" || kind === "Underscore" ||
            this.isUnary(kind)
    }

    private canStartPattern(kind: TypstSyntaxKind): boolean {
        return kind === "Underscore" || kind === "LeftParen" ||
            this.canStartCodeExpression(kind) && !this.isUnary(kind)
    }

    private isTerminator(kind: TypstSyntaxKind): boolean {
        return kind === "End" || kind === "Semicolon" || kind === "RightBrace" ||
            kind === "RightParen" || kind === "RightBracket"
    }

    private binaryPrecedence(kind: TypstSyntaxKind): {precedence: number, right: boolean} | null {
        switch (kind) {
            case "Star": case "Slash": return {precedence: 6, right: false}
            case "Plus": case "Minus": return {precedence: 5, right: false}
            case "EqEq": case "ExclEq": case "Lt": case "LtEq": case "Gt": case "GtEq":
            case "In": return {precedence: 4, right: false}
            case "And": return {precedence: 3, right: false}
            case "Or": return {precedence: 2, right: false}
            case "Eq": case "PlusEq": case "HyphEq": case "StarEq": case "SlashEq":
                return {precedence: 1, right: true}
            default: return null
        }
    }

    // Math -------------------------------------------------------------------

    private mathExpressions(stop: ReadonlySet<TypstSyntaxKind>) {
        let count = 0
        if (++this.depth > 256) {
            this.depth--
            this.unexpected()
            return 1
        }
        while (!stop.has(this.current)) {
            const before = this.start
            if (this.canStartMathExpression(this.current)) this.mathExpressionPrec(0, new Set())
            else this.unexpected()
            count++
            if (this.start === before && !stop.has(this.current)) this.unexpected()
        }
        this.depth--
        return count
    }

    private mathExpressionPrec(minPrecedence: number, stop: ReadonlySet<TypstSyntaxKind>) {
        if (++this.depth > 256) {
            this.depth--
            this.unexpected()
            return
        }
        const mark = this.marker()
        let continuable = false
        switch (this.current) {
            case "Hash": this.embeddedCodeExpression(); break
            case "MathIdent": case "MathFieldAccess":
                continuable = true
                this.eat()
                if (minPrecedence <= 2 && this.at("LeftParen") && this.directly) {
                    this.mathArguments()
                    this.wrap(mark, "MathCall")
                    continuable = false
                }
                break
            case "LeftBrace": case "LeftParen":
                this.mathDelimited()
                break
            case "RightBrace":
                this.eatAs(this.tokenText === "|]" ? "MathShorthand" : "MathText")
                break
            case "Dot": case "Bang": case "Comma": case "Semicolon": case "RightParen":
                this.eatAs("MathText")
                break
            case "MathText":
                continuable = /\p{Alphabetic}/u.test(this.tokenText)
                this.eat()
                break
            case "Linebreak": case "MathAlignPoint": case "MathShorthand":
                this.eat()
                break
            case "MathPrimes": case "Escape": case "Str":
                continuable = true
                this.eat()
                break
            case "Root": {
                this.eat()
                const operand = this.marker()
                this.mathExpressionPrec(2, new Set())
                this.mathUnparen(operand)
                this.wrap(mark, "MathRoot")
                break
            }
            default: this.insertError()
        }

        if (continuable && minPrecedence <= 2 && !this.hadTrivia &&
            (this.current === "LeftBrace" || this.current === "LeftParen")) {
            this.mathDelimited()
            this.wrap(mark, "Math")
        }

        while (!stop.has(this.current)) {
            const operator = this.current
            const trivia = this.hadTrivia
            let wrapper: "MathFrac" | "MathAttach" | "Math" | null = null
            let precedence = 0
            let right: "left" | "right" | null = null
            if (operator === "Slash") { wrapper = "MathFrac"; precedence = 1; right = "left" }
            else if (operator === "Underscore" || operator === "Hat") {
                wrapper = "MathAttach"; precedence = 2; right = "right"
            } else if (operator === "MathPrimes" && !trivia) {
                wrapper = "MathAttach"; precedence = 2
            } else if (operator === "Bang" && !trivia) {
                wrapper = "Math"; precedence = 3
            }
            if (!wrapper || precedence < minPrecedence) break

            if (operator === "Bang") this.eatAs("MathText")
            else this.eat()
            if (wrapper === "MathFrac") this.mathUnparen(mark)
            if (right) {
                const operand = this.marker()
                this.mathExpressionPrec(right === "left" ? precedence + 1 : precedence,
                    wrapper === "MathAttach" ? new Set(operator === "Hat" ? ["Underscore"] : ["Hat"]) : new Set())
                this.mathUnparen(operand)
            }
            if (wrapper === "MathAttach") {
                const other = operator === "Hat" ? "Underscore" : "Hat"
                if (this.current === other) {
                    this.eat()
                    this.mathExpressionPrec(precedence, new Set())
                }
            }
            this.wrap(mark, wrapper)
        }
        this.depth--
    }

    private mathDelimited() {
        const mark = this.marker()
        const open = this.tokenText
        this.eatAs(open === "[|" ? "MathShorthand" : "MathText")
        const body = this.marker()
        this.mathExpressions(new Set(["Dollar", "End", "RightBrace", "RightParen"]))
        if (this.current === "RightBrace" || this.current === "RightParen") {
            this.wrap(body, "Math")
            this.eatAs(this.tokenText === "|]" ? "MathShorthand" : "MathText")
            this.wrap(mark, "MathDelimited")
        } else {
            this.wrap(mark, "Math")
        }
    }

    private mathArguments() {
        const mark = this.marker()
        this.eat("LeftParen")
        while (this.current !== "End" && this.current !== "Dollar" && this.current !== "RightParen") {
            const before = this.start
            this.mathArgument()
            if (this.current === "Comma" || this.current === "Semicolon") this.eat()
            else if (!this.at("End") && !this.at("Dollar") && !this.at("RightParen")) {
                this.insertError()
                if (this.start === before) this.unexpected()
            }
        }
        this.expectClosing(mark, "RightParen")
        this.wrap(mark, "MathArgs")
    }

    private mathUnparen(mark: number) {
        const node = this.nodes[mark]
        if (!node || node.kind !== "MathDelimited" || !node.children || node.children.length < 2) return
        const first = node.children[0], last = node.children[node.children.length - 1]
        if (this.text.slice(first.from, first.to) !== "(" || this.text.slice(last.from, last.to) !== ")") return
        first.kind = "LeftParen"
        last.kind = "RightParen"
        node.kind = "Math"
    }

    private mathArgument() {
        const mark = this.marker()
        let wrapper: "Spread" | "Named" | null = null

        if (this.current === "Dot" && this.text.startsWith("..", this.start) &&
            this.text[this.start + 2] !== "." && !/\s/u.test(this.text[this.start + 2] ?? "")) {
            this.lexer.pos = this.start + 2
            this.token.node = leaf("Dots", this.start, this.start + 2)
            this.token.kind = this.token.actualKind = "Dots"
            this.eat()
            wrapper = "Spread"
        } else if (/^[\p{ID_Start}_][\p{ID_Continue}_-]*$/u.test(this.tokenText) &&
            this.text[this.tokenEnd] === ":" && this.text[this.tokenEnd + 1] !== "=") {
            const namedKind: TypstSyntaxKind = this.tokenText === "_" ? "Error" : "Ident"
            this.token.node = {...this.token.node, kind: namedKind}
            this.token.kind = this.token.actualKind = namedKind
            this.eat()
            this.eatAs("Colon")
            wrapper = "Named"
        }

        const body = this.marker()
        const count = this.mathExpressions(new Set(["End", "Dollar", "Comma", "Semicolon", "RightParen"]))
        if (count !== 1) this.wrap(body, "Math")
        if (wrapper) this.wrap(mark, wrapper)
    }

    private canStartMathExpression(kind: TypstSyntaxKind): boolean {
        return kind === "Hash" || kind === "MathIdent" || kind === "MathFieldAccess" ||
            kind === "Dot" || kind === "Comma" || kind === "Semicolon" || kind === "LeftBrace" ||
            kind === "RightBrace" || kind === "LeftParen" || kind === "RightParen" ||
            kind === "MathText" || kind === "MathShorthand" || kind === "Linebreak" ||
            kind === "MathAlignPoint" || kind === "MathPrimes" || kind === "Escape" ||
            kind === "Str" || kind === "Root" || kind === "Bang"
    }
}

function writeElement(buffer: number[], element: Element) {
    const start = buffer.length
    if (element.children) for (const child of element.children) writeElement(buffer, child)
    buffer.push(kindID[element.kind], element.from, element.to, buffer.length - start + 4)
}

function buildTree(nodeSet: NodeSet, elements: readonly Element[], length: number) {
    const buffer: number[] = []
    for (const element of elements) writeElement(buffer, element)
    return Tree.build({buffer, nodeSet, topID: typstTopID, length})
}

class TypstPartialParse implements PartialParse {
    stoppedAt: number | null = null
    private done = false
    private position: number

    constructor(
        readonly parser: TypstLezerParser,
        readonly input: Input,
        readonly fragments: readonly TreeFragment[],
        readonly ranges: readonly {from: number, to: number}[],
    ) {
        this.position = ranges[0]?.from ?? 0
    }

    get parsedPos() { return this.position }

    advance() {
        if (this.done) return null
        this.done = true
        const requestedEnd = Math.min(this.stoppedAt ?? this.input.length, this.input.length)
        const activeRanges: {from: number, to: number}[] = []
        for (const range of this.ranges) {
            if (range.from >= requestedEnd) break
            const to = Math.min(range.to, requestedEnd)
            if (range.from < to) activeRanges.push({from: range.from, to})
        }
        const absoluteEnd = activeRanges.length
            ? activeRanges[activeRanges.length - 1].to
            : requestedEnd
        const length = activeRanges.reduce((total, range) => total + range.to - range.from, 0)

        // The common no-change case can reuse the complete previous tree.
        const reusable = this.fragments.find(fragment => fragment.offset === 0 && fragment.from === 0 &&
            activeRanges.length === 1 && activeRanges[0].from === 0 && fragment.to >= absoluteEnd &&
            fragment.tree.type.name === "Typst" && fragment.tree.length === length)
        this.position = absoluteEnd
        if (reusable) return reusable.tree

        const text = activeRanges.map(range => this.input.read(range.from, range.to)).join("")
        const elements = new TypstCSTParser(text).parseDocument()
        return buildTree(this.parser.nodeSet, elements, length)
    }

    stopAt(pos: number) {
        if (this.stoppedAt != null && this.stoppedAt < pos) {
            throw new RangeError("Can't move stoppedAt forward")
        }
        this.stoppedAt = pos
    }
}

/**
 * A mode-aware, error-recovering Lezer parser for Typst 0.15.
 *
 * This follows the custom-parser approach used by `@lezer/markdown`: it emits
 * Lezer trees directly instead of trying to encode Typst's mode switches and
 * line-sensitive markup in an LR grammar.
 */
export class TypstLezerParser extends Parser {
    readonly nodeSet: NodeSet
    private readonly props: readonly NodePropSource[]

    constructor(...props: NodePropSource[]) {
        super()
        this.props = props
        this.nodeSet = props.length ? makeNodeSet(props) : typstNodeSet
    }

    createParse(
        input: Input,
        fragments: readonly TreeFragment[],
        ranges: readonly {from: number, to: number}[],
    ): PartialParse {
        return new TypstPartialParse(this, input, fragments, ranges)
    }

    /** Return a parser with additional Lezer node props. */
    configure(config: readonly NodePropSource[] | {props?: readonly NodePropSource[]}) {
        const props: readonly NodePropSource[] = Array.isArray(config)
            ? config
            : (config as {props?: readonly NodePropSource[]}).props ?? []
        return props.length ? new TypstLezerParser(...this.props, ...props) : this
    }
}

/** The default Typst 0.15 Lezer parser. */
export const typstParser = new TypstLezerParser()

/** Conventional short alias, matching other Lezer parser packages. */
export const parser = typstParser
