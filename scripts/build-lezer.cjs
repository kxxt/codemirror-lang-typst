const {build} = require("@marijn/buildtool")
const {resolve} = require("path")
const {options} = require("@codemirror/buildhelper/src/options")

build(resolve("src/lezer.ts"), {...options, bundleName: "lezer"}).then(result => {
    if (!result) process.exit(1)
})
