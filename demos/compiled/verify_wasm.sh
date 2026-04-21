#!/usr/bin/env bash
# Compiles each demo's generated.cpp to WebAssembly via emcc, runs the wasm
# module with Node, and diffs its stdout against the committed expected.txt.
# This proves the SAME emitted C++ produces the SAME stdout whether you run
# it as a native binary (verify.sh) or as wasm in a JS host (this script).
#
# Writes final artifacts to OUT_DIR (arg 1, default: ./_wasm_out), one
# subdir per demo, each containing demo.mjs + demo.wasm. Those are the files
# the browser playground loads from /demos/compiled/<name>/.

set -euo pipefail

OUT_DIR="${1:-$(pwd)/_wasm_out}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v emcc >/dev/null 2>&1; then
    echo "error: emcc not on PATH. Source emsdk_env.sh first." >&2
    exit 2
fi
if ! command -v node >/dev/null 2>&1; then
    echo "error: node not on PATH." >&2
    exit 2
fi

mkdir -p "$OUT_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

status=0

for demo_dir in "$SCRIPT_DIR"/*/; do
    name="$(basename "$demo_dir")"
    [[ "$name" == "." || "$name" == ".." ]] && continue
    [[ ! -f "$demo_dir/generated.cpp" ]] && continue

    echo "=== $name (wasm) ==="

    mkdir -p "$OUT_DIR/$name"

    # 1. C++ -> wasm. ES module so the playground can `import()` it and node
    #    can load it the same way. noInitialRun so the caller decides when to
    #    invoke main via callMain.
    emcc \
        -std=c++20 -O2 \
        "$demo_dir/generated.cpp" \
        -o "$OUT_DIR/$name/demo.mjs" \
        -sMODULARIZE=1 \
        -sEXPORT_ES6=1 \
        -sENVIRONMENT=web,worker,node \
        -sINVOKE_RUN=0 \
        -sEXPORTED_RUNTIME_METHODS=callMain \
        >/dev/null
    echo "  built demo.mjs + demo.wasm"

    # 2. Run via node, capture stdout via Module.print.
    cat > "$WORK/run_$name.mjs" <<EOF
import factory from "$OUT_DIR/$name/demo.mjs";
const lines = [];
const mod = await factory({
    print:    (s) => lines.push(s),
    printErr: (s) => lines.push(s),
    noInitialRun: true,
});
mod.callMain([]);
process.stdout.write(lines.join("\n") + "\n");
EOF

    node "$WORK/run_$name.mjs" > "$WORK/$name.stdout" 2>&1 || {
        echo "FAIL: wasm run errored for $name"
        cat "$WORK/$name.stdout"
        status=1
        continue
    }

    if ! diff -u "$demo_dir/expected.txt" "$WORK/$name.stdout"; then
        echo "FAIL: wasm stdout drifted for $name"
        status=1
        continue
    fi
    echo "  wasm stdout matches expected.txt"
done

if [[ $status -eq 0 ]]; then
    echo
    echo "All demos reproduced bit-for-bit via wasm."
fi

exit $status
