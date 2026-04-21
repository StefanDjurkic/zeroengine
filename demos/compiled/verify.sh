#!/usr/bin/env bash
# Re-runs the JSPP -> C++ -> native pipeline for each demo in demos/compiled/
# and diffs against the committed artifacts. Used by CI to prove the demos
# stay honest.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <path-to-jspp-binary>" >&2
    exit 2
fi

JSPP_BIN="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -x "$JSPP_BIN" ]]; then
    echo "error: jspp binary not found or not executable: $JSPP_BIN" >&2
    exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

status=0

for demo_dir in "$SCRIPT_DIR"/*/; do
    name="$(basename "$demo_dir")"
    [[ "$name" == "." || "$name" == ".." ]] && continue
    [[ ! -f "$demo_dir/source.jspp" ]] && continue

    echo "=== $name ==="

    # 1. JSPP -> C++
    "$JSPP_BIN" "$demo_dir/source.jspp" -o "$WORK/$name.cpp" >/dev/null

    # 2. Compare generated C++ against committed copy
    if ! diff -u "$demo_dir/generated.cpp" "$WORK/$name.cpp"; then
        echo "FAIL: generated.cpp drifted for $name"
        status=1
        continue
    fi
    echo "  generated.cpp matches"

    # 3. C++ -> native
    g++ -std=c++20 -O2 "$WORK/$name.cpp" -o "$WORK/$name.exe"
    echo "  compiled with g++"

    # 4. Run and diff stdout
    "$WORK/$name.exe" > "$WORK/$name.stdout" 2>&1
    if ! diff -u "$demo_dir/expected.txt" "$WORK/$name.stdout"; then
        echo "FAIL: stdout drifted for $name"
        status=1
        continue
    fi
    echo "  stdout matches expected.txt"
done

if [[ $status -eq 0 ]]; then
    echo
    echo "All demos reproduced bit-for-bit."
fi

exit $status
