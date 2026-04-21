#!/usr/bin/env node
// ============================================================================
// Unified Test Runner — JS++ Self-Testing Pipeline
//
// Runs all 3 test layers in sequence:
//   Layer 1: Browser compatibility lint (fast, no browser)
//   Layer 2: Node interpreter regression tests (17 tests)
//   Layer 3: Headless browser integration tests (Playwright)
//
// Usage: node test_all.mjs [--verbose] [--skip-browser]
// ============================================================================

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the JSPP repo root. Supports two layouts:
//   1. Sibling:  <workspace>/jspp/  +  <workspace>/zeroengine/  (preferred)
//   2. Monorepo: <workspace>/{prototype,tests}  +  <workspace>/ZeroEngine/
// An explicit JSPP_ROOT env var wins over both.
function resolveJsppRoot() {
    if (process.env.JSPP_ROOT) return resolve(process.env.JSPP_ROOT);
    const sibling = resolve(__dirname, "..", "..", "jspp");
    if (existsSync(join(sibling, "tests", "run.mjs"))) return sibling;
    const mono = resolve(__dirname, "..", "..");
    if (existsSync(join(mono, "tests", "run.mjs"))) return mono;
    throw new Error("Could not locate the JSPP repo. Clone https://github.com/StefanDjurkic/jspp next to this repo, or set JSPP_ROOT.");
}

const root = resolveJsppRoot();
const nodeExe = process.execPath;

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const skipBrowser = args.includes("--skip-browser");

function runLayer(label, script, cwd) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${"═".repeat(60)}`);

    const extraArgs = verbose ? ["--verbose"] : [];

    try {
        const output = execFileSync(nodeExe, [script, ...extraArgs], {
            cwd,
            encoding: "utf-8",
            timeout: 120000,
            stdio: ["pipe", "pipe", "pipe"],
        });
        process.stdout.write(output);
        return true;
    } catch (err) {
        // execFileSync throws on non-zero exit
        if (err.stdout) process.stdout.write(err.stdout);
        if (err.stderr) process.stderr.write(err.stderr);
        return false;
    }
}

console.log("\n  JS++ Self-Testing Pipeline\n");

let allPassed = true;

// Layer 1: Browser Compatibility Lint
if (!runLayer("Layer 1: Browser Compatibility Lint", join(__dirname, "test_browser_compat.mjs"), __dirname)) {
    allPassed = false;
    console.log("\n  ⚠ Layer 1 failed — fix browser compatibility issues before proceeding.\n");
    process.exit(1);
}

// Layer 2: Node Interpreter Tests
if (!runLayer("Layer 2: Node Interpreter Regression Tests", join(root, "tests", "run.mjs"), root)) {
    allPassed = false;
    console.log("\n  ⚠ Layer 2 failed — interpreter regression tests broken.\n");
    process.exit(1);
}

// Layer 3: Headless Browser Integration Tests
if (skipBrowser) {
    console.log(`\n${"═".repeat(60)}`);
    console.log("  Layer 3: Headless Browser Tests — SKIPPED (--skip-browser)");
    console.log(`${"═".repeat(60)}\n`);
} else {
    if (!runLayer("Layer 3: Headless Browser Integration Tests", join(__dirname, "test_browser.mjs"), __dirname)) {
        allPassed = false;
    }
}

// Final summary
console.log(`\n${"═".repeat(60)}`);
if (allPassed) {
    console.log("  ✓ ALL LAYERS PASSED");
} else {
    console.log("  ✗ SOME TESTS FAILED");
}
console.log(`${"═".repeat(60)}\n`);

process.exit(allPassed ? 0 : 1);
