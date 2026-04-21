#!/usr/bin/env node
// ============================================================================
// Layer 3: Headless Browser Integration Tests
//
// Uses Playwright to launch headless Chromium, load jspp.html, and verify:
//   1. Page loads without console errors
//   2. Engine + interpreter initialize
//   3. Running code produces expected output
//   4. Full regression suite through the browser interpreter
//
// Usage: node test_browser.mjs [--verbose] [filter]
// ============================================================================

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function resolveJsppRoot() {
    if (process.env.JSPP_ROOT) return path.resolve(process.env.JSPP_ROOT);
    const sibling = path.resolve(__dirname, "..", "..", "jspp");
    if (fs.existsSync(path.join(sibling, "tests", "run.mjs"))) return sibling;
    const mono = path.resolve(__dirname, "..", "..");
    if (fs.existsSync(path.join(mono, "tests", "run.mjs"))) return mono;
    throw new Error("Could not locate the JSPP repo. Clone https://github.com/StefanDjurkic/jspp next to this repo, or set JSPP_ROOT.");
}
const EX_ROOT = resolveJsppRoot();
const TESTS_DIR = path.join(EX_ROOT, "tests");
const JSPP_HTML_PATH = "/ZeroEngine/client/jspp.html";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const filter = args.find(a => !a.startsWith("--")) || null;

// ---- Minimal static file server with no-cache headers ----

const MIME_TYPES = {
    ".html": "text/html",
    ".js":   "application/javascript",
    ".mjs":  "application/javascript",
    ".wasm": "application/wasm",
    ".css":  "text/css",
    ".json": "application/json",
};

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split("?")[0]);
            const filePath = path.join(EX_ROOT, urlPath);

            // Security: prevent directory traversal
            if (!path.resolve(filePath).startsWith(EX_ROOT)) {
                res.writeHead(403);
                res.end("Forbidden");
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end("Not found: " + urlPath);
                    return;
                }
                const ext = path.extname(filePath);
                const mime = MIME_TYPES[ext] || "application/octet-stream";
                res.writeHead(200, {
                    "Content-Type": mime,
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                    "Cross-Origin-Opener-Policy": "same-origin",
                    "Cross-Origin-Embedder-Policy": "require-corp",
                });
                res.end(data);
            });
        });

        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            resolve({ server, port });
        });
        server.on("error", reject);
    });
}

// ---- Test infrastructure ----

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
    console.log(`  ✓  ${name}`);
    passed++;
}

function fail(name, reason) {
    console.log(`  ✗  ${name}`);
    failures.push({ name, reason });
    failed++;
}

// ---- Helpers that interact with the page ----

async function getOutputLines(page) {
    return page.$$eval("#output div", divs => divs.map(d => ({
        text: d.textContent,
        className: d.className,
    })));
}

async function getOutputText(page) {
    const lines = await getOutputLines(page);
    return lines.map(l => l.text);
}

async function clearOutput(page) {
    await page.click("#btn-clear");
}

async function runCode(page, code) {
    await clearOutput(page);
    // Set editor content directly via JS to avoid encoding issues with page.fill
    await page.evaluate((src) => {
        document.getElementById("code-editor").value = src;
    }, code);
    await page.click("#btn-run");
    // Wait a tick for execution
    await page.waitForTimeout(200);
}

async function getProgramOutput(page) {
    const lines = await getOutputLines(page);
    // Filter out system messages (info class) and error class, keep program output
    return lines
        .filter(l => !l.className.includes("info") && !l.className.includes("error"))
        .map(l => l.text);
}

async function getErrorLines(page) {
    const lines = await getOutputLines(page);
    return lines.filter(l => l.className.includes("error")).map(l => l.text);
}

// ---- Test suite ----

async function testPageLoads(page, consoleErrors) {
    const name = "page_loads_without_errors";
    const output = await getOutputText(page);

    const hasInterp = output.some(l => l.includes("JS++ interpreter ready"));
    // Filter out known non-fatal errors (WebGPU adapter not found in headless, favicon)
    const fatalErrors = consoleErrors.filter(e =>
        !e.includes("favicon.ico") &&
        !e.includes("DevTools") &&
        !e.includes("No suitable graphics adapter") &&
        !e.includes("webgpu found no adapters") &&
        !e.includes("Failed to start ZeroEngine")
    );

    if (!hasInterp) {
        fail(name, "Missing 'JS++ interpreter ready' in output. Output: " + output.join(" | ") + " Console errors: " + consoleErrors.join(" | "));
        return false;
    }
    if (fatalErrors.length > 0) {
        fail(name, "Fatal console errors: " + fatalErrors.join(" | "));
        return false;
    }

    // Note if WASM engine loaded or not
    const hasWasm = output.some(l => l.includes("ZeroEngine WASM loaded"));
    if (hasWasm) {
        ok(name + " (engine + interpreter)");
    } else {
        ok(name + " (interpreter only — no WebGPU in headless)");
    }
    return true;
}

async function testRunHello(page) {
    const name = "run_hello_world";
    const code = 'print("hello world");';
    await runCode(page, code);
    const output = await getProgramOutput(page);
    const errors = await getErrorLines(page);

    if (errors.length > 0) {
        fail(name, "Errors: " + errors.join(" | "));
        return;
    }
    if (output.join("\n").trim() !== "hello world") {
        fail(name, `Expected "hello world", got: "${output.join("\\n")}"`);
        return;
    }
    ok(name);
}

async function testDrawCommands(page) {
    const name = "draw_commands_no_errors";
    await runCode(page, [
        "clear(30, 30, 40);",
        "drawRect(50, 50, 200, 100, 255, 80, 80);",
        "drawCircle(300, 200, 60, 80, 200, 255);",
        'drawLine(10, 10, 400, 300, 255, 255, 100);',
        'print("drawing done");',
    ].join("\n"));

    const errors = await getErrorLines(page);
    const output = await getProgramOutput(page);

    if (errors.length > 0) {
        fail(name, "Errors: " + errors.join(" | "));
        return;
    }
    if (!output.some(l => l.includes("drawing done"))) {
        fail(name, "Missing 'drawing done' in output: " + output.join(" | "));
        return;
    }
    ok(name);
}

async function testRegressionSuite(page) {
    // Discover test files
    const files = fs.readdirSync(TESTS_DIR)
        .filter(f => f.endsWith(".jspp"))
        .sort();

    const tests = files.map(f => {
        const name = f.replace(/\.jspp$/, "");
        const expectedFile = f.replace(/\.jspp$/, ".expected");
        const expectedPath = path.join(TESTS_DIR, expectedFile);
        if (!fs.existsSync(expectedPath)) return null;
        return {
            name,
            source: fs.readFileSync(path.join(TESTS_DIR, f), "utf-8"),
            expected: fs.readFileSync(expectedPath, "utf-8").replace(/\r\n/g, "\n").trimEnd(),
        };
    }).filter(Boolean);

    // Skip import tests — fs is stubbed in browser
    const SKIP = ["17_imports"];

    for (const t of tests) {
        const testName = `regression/${t.name}`;

        if (SKIP.includes(t.name)) {
            console.log(`  ⊘  ${testName} (skipped — requires fs)`);
            continue;
        }

        if (filter && !t.name.includes(filter)) continue;

        await runCode(page, t.source);
        const output = await getProgramOutput(page);
        const errors = await getErrorLines(page);
        const actual = output.join("\n").trimEnd();

        if (errors.length > 0) {
            fail(testName, "Errors: " + errors.join(" | "));
            if (verbose) {
                console.log(`    Errors: ${errors.join("\n           ")}`);
            }
            continue;
        }

        if (actual === t.expected) {
            ok(testName);
        } else {
            fail(testName, `Output mismatch`);
            if (verbose) {
                console.log(`    Expected: ${t.expected.split("\n").join("\n              ")}`);
                console.log(`    Actual:   ${actual.split("\n").join("\n              ")}`);
            }
        }
    }
}

// ---- Main ----

async function main() {
    console.log("\n  Headless Browser Integration Tests\n");

    // Start server
    const { server, port } = await startServer();
    const pageUrl = `http://127.0.0.1:${port}${JSPP_HTML_PATH}`;

    if (verbose) console.log(`  Server on port ${port}, loading ${pageUrl}\n`);

    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: [
                "--enable-unsafe-webgpu",
                "--enable-features=Vulkan,UseSkiaRenderer",
                "--use-angle=vulkan",
            ],
        });
        const context = await browser.newContext();
        const page = await context.newPage();

        // Collect console errors
        const consoleErrors = [];
        page.on("console", msg => {
            if (msg.type() === "error") {
                consoleErrors.push(msg.text());
            }
        });
        page.on("pageerror", err => {
            consoleErrors.push(err.message);
        });

        // Navigate and wait for initialization
        await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 });

        // Wait for interpreter to be ready (up to 10s)
        try {
            await page.waitForFunction(
                () => {
                    const output = document.getElementById("output");
                    return output && output.textContent.includes("interpreter ready");
                },
                { timeout: 15000 }
            );
        } catch {
            // Even if timeout, proceed — testPageLoads will catch it
        }

        // Run tests
        const pageOk = await testPageLoads(page, consoleErrors);

        if (pageOk) {
            await testRunHello(page);
            await testDrawCommands(page);
            await testRegressionSuite(page);
        } else {
            console.log("\n  Page failed to load — skipping remaining tests.\n");
        }

    } catch (err) {
        fail("browser_launch", err.message);
    } finally {
        if (browser) await browser.close();
        server.close();
    }

    // Summary
    console.log(`\n  ─────────────────────────────────────`);
    console.log(`  ${passed} passed, ${failed} failed`);

    if (failures.length > 0) {
        console.log(`\n  FAILURES:\n`);
        for (const f of failures) {
            console.log(`  ── ${f.name} ──`);
            console.log(`     ${f.reason}\n`);
        }
    } else if (failures.length === 0) {
        console.log("\n  All browser integration tests passed.\n");
    }

    process.exit(failures.length > 0 ? 1 : 0);
}

main();
