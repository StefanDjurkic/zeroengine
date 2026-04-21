// Browser shims for Node.js built-in modules used by jspp.mjs.
// The interpreter doesn't use fs/path/url at runtime — only the
// CLI main() path does — so these are safe no-op stubs.

export function readFileSync() { throw new Error("fs.readFileSync is not available in the browser"); }
export function writeFileSync() { throw new Error("fs.writeFileSync is not available in the browser"); }
export function basename(p) { return p.split(/[\\/]/).pop() || p; }
export function dirname(p) { const parts = p.split(/[\\/]/); parts.pop(); return parts.join("/") || "."; }
export function join(...parts) { return parts.join("/"); }
export function resolve(...parts) { return parts.join("/"); }
export function pathToFileURL(p) { return new URL("file:///" + p); }
