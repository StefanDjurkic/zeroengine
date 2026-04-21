/**
 * JS++ → ZeroEngine Bridge
 *
 * This module connects the JS++ interpreter to the ZeroEngine WASM runtime.
 * It installs built-in functions (drawRect, drawCircle, drawLine, clear, print,
 * console.log) on the interpreter that call directly into the Rust/WASM exports.
 *
 * Usage:
 *   import { Interpreter, parseSource } from "./jspp.mjs";
 *   import { installEngineBridge, executeScript } from "./jspp_engine_bridge.mjs";
 *
 *   // After WASM module is loaded:
 *   const interpreter = new Interpreter();
 *   installEngineBridge(interpreter, wasmExports);
 *   executeScript(interpreter, source);
 */

/**
 * Type-check prelude — stub declarations so the JS++ type checker
 * doesn't reject the engine built-in functions.
 */
export const TYPECHECK_PRELUDE = `
function drawRect(x: int, y: int, width: int, height: int, r: int, g: int, b: int): void {}
function drawCircle(x: int, y: int, radius: int, r: int, g: int, b: int): void {}
function drawLine(x1: int, y1: int, x2: int, y2: int, r: int, g: int, b: int): void {}
function clear(r: int, g: int, b: int): void {}
function print(...args: auto): void {}
`;

/**
 * Clamp a value to 0-255 color range.
 */
function clampColor(v) {
    return Math.round(Math.max(0, Math.min(255, Number(v) || 0)));
}

/**
 * Coerce a value to a number, defaulting to 0.
 */
function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Install engine drawing builtins on a JS++ Interpreter instance.
 *
 * @param {Interpreter} interpreter - the JS++ interpreter instance
 * @param {object} wasm - the WASM module exports (from wasm-bindgen pkg)
 */
export function installEngineBridge(interpreter, wasm) {
    const global = interpreter.global;

    // drawRect(x, y, width, height, r, g, b)
    global.define("drawRect", (x, y, width, height, r, g, b) => {
        wasm.jspp_draw_rect(
            toNumber(x), toNumber(y), toNumber(width), toNumber(height),
            clampColor(r), clampColor(g), clampColor(b)
        );
    });

    // drawCircle(x, y, radius, r, g, b)
    global.define("drawCircle", (x, y, radius, r, g, b) => {
        wasm.jspp_draw_circle(
            toNumber(x), toNumber(y), toNumber(radius),
            clampColor(r), clampColor(g), clampColor(b)
        );
    });

    // drawLine(x1, y1, x2, y2, r, g, b)
    global.define("drawLine", (x1, y1, x2, y2, r, g, b) => {
        wasm.jspp_draw_line(
            toNumber(x1), toNumber(y1), toNumber(x2), toNumber(y2),
            clampColor(r), clampColor(g), clampColor(b)
        );
    });

    // clear(r?, g?, b?) — reset the 2D overlay scene
    global.define("clear", (r, g, b) => {
        wasm.jspp_clear(
            clampColor(r ?? 18), clampColor(g ?? 18), clampColor(b ?? 22)
        );
    });

    // Override print to go through the engine log
    global.define("print", (...args) => {
        const line = args.map(a => String(a)).join(" ");
        wasm.jspp_log(line);
        interpreter.emitOutput(line);
    });

    // console object
    global.define("console", {
        log: (...args) => {
            const line = args.map(a => String(a)).join(" ");
            wasm.jspp_log(line);
            interpreter.emitOutput(line);
        }
    });
}

/**
 * Execute a JS++ source string through the interpreter with engine builtins.
 *
 * @param {Interpreter} interpreter - the JS++ interpreter (with bridge installed)
 * @param {function} parseSource - the parseSource function from jspp.mjs
 * @param {string} source - JS++ source code to execute
 * @returns {{ output: string[], errors: string[] }}
 */
export function executeScript(interpreter, parseSource, source) {
    const result = { output: [], errors: [] };

    try {
        const { ast } = parseSource(source, "<editor>");
        interpreter.output = [];
        interpreter.run(ast);
        result.output = [...interpreter.output];
    } catch (err) {
        result.errors.push(err.message || String(err));
    }

    return result;
}
