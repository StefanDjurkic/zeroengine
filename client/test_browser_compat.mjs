#!/usr/bin/env node
// ============================================================================
// Layer 1: Browser Compatibility Lint
//
// Scans jspp.mjs and typechecker.mjs for unguarded Node-only globals
// that would crash in a browser environment. Also validates import map
// coverage in jspp.html.
//
// Usage: node test_browser_compat.mjs
// ============================================================================

import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveJsppRoot() {
    if (process.env.JSPP_ROOT) return resolve(process.env.JSPP_ROOT);
    const sibling = resolve(__dirname, "..", "..", "jspp");
    if (existsSync(join(sibling, "prototype", "jspp.mjs"))) return sibling;
    const mono = resolve(__dirname, "..", "..");
    if (existsSync(join(mono, "prototype", "jspp.mjs"))) return mono;
    throw new Error("Could not locate the JSPP repo. Clone https://github.com/StefanDjurkic/jspp next to this repo, or set JSPP_ROOT.");
}

const root = resolveJsppRoot();
const protoDir = join(root, "prototype");
const clientDir = __dirname;

let failures = 0;

function fail(file, line, message) {
    console.log(`  ✗  ${file}:${line} — ${message}`);
    failures++;
}

function pass(message) {
    console.log(`  ✓  ${message}`);
}

// ---- Scan source files for unguarded Node globals ----

const NODE_GLOBALS = [
    { pattern: /\bprocess\./g, name: "process.", guard: "typeof process" },
    { pattern: /\brequire\s*\(/g, name: "require(", guard: "typeof require" },
    { pattern: /\b__dirname\b/g, name: "__dirname", guard: null },
    { pattern: /\b__filename\b/g, name: "__filename", guard: null },
    { pattern: /\bBuffer\./g, name: "Buffer.", guard: "typeof Buffer" },
    { pattern: /\bchild_process\b/g, name: "child_process", guard: null },
];

function scanFile(relPath, absPath) {
    const source = readFileSync(absPath, "utf-8");
    const lines = source.split("\n");
    let fileFailures = 0;

    // Find function boundaries for guard detection
    function findEnclosingFunctionStart(lineIdx) {
        for (let i = lineIdx; i >= 0; i--) {
            if (/^\s*function\s+\w+/.test(lines[i]) || /^\s*(const|let|var)\s+\w+\s*=\s*(async\s+)?function/.test(lines[i])) {
                return i;
            }
        }
        return 0; // module scope
    }

    for (const { pattern, name, guard } of NODE_GLOBALS) {
        pattern.lastIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!pattern.test(line)) continue;
            pattern.lastIndex = 0;

            // Skip lines that are inside comments
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

            // Check if a guard exists anywhere between the enclosing function start and this line
            if (guard) {
                const fnStart = findEnclosingFunctionStart(i);
                let guarded = false;
                for (let j = fnStart; j <= i; j++) {
                    if (lines[j].includes(guard)) {
                        guarded = true;
                        break;
                    }
                }
                if (guarded) continue;
            }

            fail(relPath, i + 1, `unguarded ${name} — will crash in browser`);
            fileFailures++;
        }
    }

    if (fileFailures === 0) {
        pass(`${relPath} — no unguarded Node globals`);
    }
}

// ---- Validate import map covers all bare module imports ----

function checkImportMap() {
    const jsppSource = readFileSync(join(protoDir, "jspp.mjs"), "utf-8");
    const htmlSource = readFileSync(join(clientDir, "jspp.html"), "utf-8");

    // Extract bare module specifiers from import statements in jspp.mjs
    const importRegex = /^\s*import\s+.*\s+from\s+["']([^./][^"']*)["']/gm;
    const bareImports = new Set();
    let match;
    while ((match = importRegex.exec(jsppSource)) !== null) {
        bareImports.add(match[1]);
    }

    // Extract modules covered by the import map in jspp.html
    const mapMatch = htmlSource.match(/<script\s+type="importmap"[^>]*>([\s\S]*?)<\/script>/);
    if (!mapMatch) {
        fail("jspp.html", 0, "no import map found — bare module imports will fail");
        return;
    }

    let importMap;
    try {
        importMap = JSON.parse(mapMatch[1]);
    } catch (e) {
        fail("jspp.html", 0, `import map is invalid JSON: ${e.message}`);
        return;
    }

    const mapped = new Set(Object.keys(importMap.imports || {}));

    for (const mod of bareImports) {
        if (mapped.has(mod)) {
            pass(`import map covers "${mod}"`);
        } else {
            fail("jspp.html", 0, `bare import "${mod}" is NOT covered by import map`);
        }
    }
}

// ---- Run ----

console.log("\n  Browser Compatibility Lint\n");

const filesToScan = [
    ["prototype/jspp.mjs", join(protoDir, "jspp.mjs")],
    ["prototype/typechecker.mjs", join(protoDir, "typechecker.mjs")],
];

for (const [rel, abs] of filesToScan) {
    scanFile(rel, abs);
}

checkImportMap();

console.log(`\n  ─────────────────────────────────────`);
if (failures === 0) {
    console.log("  All browser compatibility checks passed.\n");
    process.exit(0);
} else {
    console.log(`  ${failures} compatibility issue(s) found.\n`);
    process.exit(1);
}
