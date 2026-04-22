# ZeroEngine

[![CI](https://github.com/StefanDjurkic/zeroengine/actions/workflows/ci.yml/badge.svg)](https://github.com/StefanDjurkic/zeroengine/actions/workflows/ci.yml)
[![Deploy](https://github.com/StefanDjurkic/zeroengine/actions/workflows/pages.yml/badge.svg)](https://github.com/StefanDjurkic/zeroengine/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ZeroEngine is a prototype game / browser engine and the primary demo surface for [JSPP](https://github.com/StefanDjurkic/jspp). It ships as both a public website and a desktop app. The same HTML front-end runs in both; the desktop build adds a local compile bridge that turns JSPP source into real native C++ on your machine.

- **Live demo:** https://stefandjurkic.github.io/zeroengine/
- **Desktop app:** [latest release](https://github.com/StefanDjurkic/zeroengine/releases/latest)

> Pre-alpha. Expect breakage.

## What you get

**Home page (`client/index.html`).** A launcher grid: Playground, Browser, Compile Bridge, and Apps. When the desktop app is running, the public website detects it (via `http://127.0.0.1:17849/info`) and the dependent tiles light up; they go dim otherwise.

**Playground (`client/jspp.html`).** An editor with six built-in scenes, an Apps button for the sample gallery, a **Run as compiled C++** button (desktop only), and a **Benchmark** button that reports per-frame cost for both the JSPP reference interpreter and the compiled native binary. See [About the benchmark](#about-the-benchmark) for what those numbers actually mean.

**Compile bridge (desktop).** The Tauri shell bundles the JSPP compiler next to `ZeroEngine.exe`, exposes `bridge_info` and `compile_and_run` IPC commands, and runs an Axum HTTP server on `127.0.0.1:17849` that the public website is allow-listed to call. Compiled binaries emit a tiny stdout protocol (`@C`/`@R`/`@O`/`@L`/`@F`/`@E`) which the playground parses and replays on canvas at 60 FPS.

**Sample apps.** Defined in `client/sample_apps.mjs` and shared by the home page and the playground.

| App | Mode | Notes |
|---|---|---|
| Bouncy Balls | 2D | 24 balls, dt-based physics, 640×520. |
| Particle Field | 2D | 400 particles on rotating, pulsing orbits. |
| Starfield | 2D | 300 stars streaking outward. |
| Pendulum Clock | 2D | Double pendulum with a 90-point trail. |
| Ripples | 2D | Concentric rings from random seeds. |
| 3D Rotating Cube | 3D | Drives a Three.js cube via `setRotation` / `setFaceColor`. |

The desktop app can also load `.zeroapp` folders from disk.

## About the benchmark

The Benchmark button runs your current program twice and prints per-frame cost. On draw-heavy workloads the native C++ column can look slower than the interpreter — this is expected and is a property of the benchmark, not the compiler:

- The JS column stubs draw builtins to no-ops; it only measures `tick()` math.
- The C++ column has to serialize every draw into the ZeroEngine stdout protocol so frames can be replayed on canvas. For a 400-particle scene that is roughly 3.5 MB of formatted output over 240 frames.

For pure compute, compiled C++ is typically 30–100× faster than the tree-walking interpreter. The compile-pipeline demos under [`demos/compiled/`](demos/compiled) run the same JSPP source through the full pipeline without the stdout-protocol tax and are a better like-for-like comparison.

## Compile pipeline (`demos/compiled/`)

Each folder commits `source.jspp`, `generated.cpp` (verbatim compiler output), and `expected.txt` (what the native binary printed). `demos/compiled/verify.sh` re-runs the whole pipeline and diffs against the committed artifacts; the `jspp-pipeline` CI job runs it on every push. `verify_wasm.sh` compiles the same `generated.cpp` to WebAssembly via Emscripten; the playground has a **run wasm** tab that imports `demo.mjs` in the browser and live-diffs its stdout against `expected.txt`.

| Demo | What it exercises |
|---|---|
| `hello` | `print` / string literal codegen. |
| `fibonacci` | Recursive functions, integer codegen. |
| `classes` | Class codegen, field access, method dispatch. |
| `demo` | Broader mix: variables, arithmetic, control flow, string concat. |
| `mandelbrot` | 96×64 fractal; nested loops, doubles, tight inner loop. |

Reproduce locally:

```bash
# from the JSPP repo: https://github.com/StefanDjurkic/jspp
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel

# from this repo
demos/compiled/verify.sh /path/to/jspp/build/jspp    # native
source /path/to/emsdk/emsdk_env.sh                   # one-time
demos/compiled/verify_wasm.sh                        # wasm in node
```

## Project layout

```
Cargo.toml   Workspace root
shared/      Types + messages shared by client and server
client/      WASM client (renderer, input, networking, scripting, UI)
desktop/     Tauri shell + compile bridge
server/      Authoritative game server
assets/      Models, textures, audio, animations
demos/       Compile-pipeline artifacts
scripts/     Build / deploy helpers
```

Rust (stable) + `wgpu` for the client, `wasm-pack` + `wasm-bindgen` for the WASM build, `bevy_ecs` for ECS, WebSockets for networking, Tauri for the desktop shell.

## Build

Requires Rust (stable) with the `wasm32-unknown-unknown` target, [`wasm-pack`](https://rustwasm.github.io/wasm-pack/), Node.js ≥ 20, and Python 3 (for `scripts/generate_bootstrap_glb.py`).

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

**Web client:**

```bash
wasm-pack build client --target web
cd client && python -m http.server 8000
# open http://localhost:8000/index.html
```

**Desktop app:**

```bash
cargo tauri build --config desktop/tauri.conf.json
```

**Server:**

```bash
cargo build --release -p zero-engine-server
```

The server listens on a WebSocket port (see `server/src/networking/mod.rs`, default `127.0.0.1:9001`).

## JSPP browser host

If the [JSPP](https://github.com/StefanDjurkic/jspp) repo is cloned as a sibling folder, the browser page can run `.jspp` programs and execute the JSPP regression suite inside a headless Chromium:

```
your-workspace/
├── jspp/          # https://github.com/StefanDjurkic/jspp
└── zeroengine/    # this repo
```

```bash
cd client
npm install
npx playwright install chromium
node test_all.mjs
```

`test_all.mjs` runs three layers: a compatibility lint, Node regression tests against the JSPP interpreter, and a Playwright run of the same tests through the browser host. JSPP location is resolved via `JSPP_ROOT`, a sibling `jspp/` folder, or a monorepo layout. Layer 3 (browser) currently assumes the monorepo layout; use `--skip-browser` otherwise.

If you are not using JSPP, ignore `client/jspp.html`, `client/jspp_engine_bridge.mjs`, `client/node-shims.mjs`, and the test scripts.

## Deployment

`scripts/deploy_zeroengine.ps1.example` is a PowerShell template that builds the WASM client and `scp`s it to a remote host. Copy it to `scripts/deploy_zeroengine.ps1` and fill in your own SSH key, host, and paths. The filled-in file is gitignored.

## Security

Do not commit private keys, server IPs, or domain names. `.gitignore` excludes `scripts/deploy_zeroengine.ps1`, `.tmp-deploy/`, `.tmp-live-compare/`, `target/`, and `**/pkg/`. `node_modules/` is excluded; contributors install their own.

## Contributing

Side project; contributions welcome. Open an issue or PR.

## License

MIT — see [LICENSE](LICENSE).
