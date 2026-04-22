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
# ZeroEngine

ZeroEngine is a 3D browser MMO prototype currently being used to demo aspects of JSPP. 

[![CI](https://github.com/StefanDjurkic/zeroengine/actions/workflows/ci.yml/badge.svg)](https://github.com/StefanDjurkic/zeroengine/actions/workflows/ci.yml)
[![Deploy](https://github.com/StefanDjurkic/zeroengine/actions/workflows/pages.yml/badge.svg)](https://github.com/StefanDjurkic/zeroengine/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**🎮 Live demo:** https://stefandjurkic.github.io/zeroengine/ — home page, playground, and sample-app gallery, all running in the browser on top of the JSPP reference interpreter and Three.js.

**🖥️ Desktop app:** [Download ZeroEngine Desktop](https://github.com/StefanDjurkic/zeroengine/releases/latest) — a Tauri shell that *is* a home page, a browser, a JSPP playground, and a local compile bridge. Inside the desktop app, the playground's "Run as compiled C++" button sends your editor source through the [JSPP](https://github.com/StefanDjurkic/jspp) compiler, builds the resulting C++ with your local toolchain (`g++` / `clang++` / `cl`), and executes the native binary. Real C++, really running, from whatever you just typed.

## What this app does 
ZeroEngine is a single **page-and-desktop** experience wired around the JSPP language. The *same* HTML home page is served both by GitHub Pages and by the Tauri desktop shell:

- **Home page (`client/index.html`)** — a launcher grid with four tiles: Playground, Browser, Compile Bridge, and ZeroEngine Apps. The Compile Bridge tile auto-probes `http://127.0.0.1:17849/info` every few seconds, so the **public website lights up live when the desktop engine is running on your machine** and goes dark when it quits.
- **Playground (`client/jspp.html`)** — a real editor with six curated scenes plus an **Apps** button that opens the sample-app gallery inline. Each program runs live on a 2D canvas or drives a Three.js cube. Loading a sample swaps the header from "JSPP Playground" into a dedicated app view (icon, name, description, Exit button).
- **Native C++ compile bridge** — the desktop app bundles the JSPP compiler next to `ZeroEngine.exe` and exposes two commands: `bridge_info` and `compile_and_run`. It also starts an Axum HTTP server on `127.0.0.1:17849` that the public website is allow-listed to call, so `stefandjurkic.github.io/zeroengine/` can compile and run your JSPP as **real native C++** on your machine while you stay on the web.
- **Visual replay protocol** — compiled C++ binaries emit a tiny `@C`/`@R`/`@O`/`@L`/`@F`/`@E` line protocol to stdout; the playground parses those frames and replays them on the canvas at 60 FPS. You are watching a native binary's stdout, pixel by pixel.
- **Per-frame benchmark** — a **Benchmark** button runs the current program both through the JSPP reference interpreter and through the native C++ pipeline, then reports per-frame cost for each and the speedup ratio.
- **Custom apps** — bundled `.zeroapp`s (bouncy balls, 400-particle field, starfield, double pendulum, ripples, 3D cube) live in `client/sample_apps.mjs` and are shared by both the home page and the playground. The desktop app can also load `.zeroapp` folders from disk.

### Sample apps (shared home ↔ playground gallery)

| App | Mode | What it does |
|---|---|---|
| Bouncy Balls | 2D | 24 colored balls with dt-based physics, walls at 640×520. |
| Particle Field | 2D | 400 particles on rotating, pulsing orbits — heavy per-frame workload. |
| Starfield | 2D | 300 stars streaking outward from the center. |
| Pendulum Clock | 2D | Double pendulum with a 90-point trailing comet. |
| Ripples | 2D | Concentric rings expanding from randomly seeded points. |
| 3D Rotating Cube | 3D | Drives a real Three.js cube via `setRotation` / `setFaceColor`, pure JSPP. |

> This is experimental, pre-alpha code. Expect breakage.

## Demos

ZeroEngine ships three flavors of demo that together cover the full JSPP story: live interpreter on the landing page, live interpreter in the playground, and a committed compile pipeline with CI re-verification.

### Landing page — `client/index.html`

Live at https://stefandjurkic.github.io/zeroengine/. A small JSPP script drives a Three.js cube: rotation, scale, per-face colors, and click behavior are all written in JSPP. The JS reference interpreter (`prototype/jspp.mjs` from the JSPP repo) runs that JSPP source in the browser and calls into Three.js to render. You are watching JSPP semantics execute, not a canned animation.

### Playground — `client/jspp.html`

Live at https://stefandjurkic.github.io/zeroengine/jspp.html. A real editor with Run / Reset, console output, and six scene pills:

| Scene | What it does |
|---|---|
| `hello` | Fills the canvas with a backdrop, then draws randomized rectangles and circles using `drawRect` / `drawCircle`. Re-run to reshuffle. |
| `loops` | Nested `for` loops paint a grid of circles with a hue-shifting color ramp. |
| `functions` | Recursive Fibonacci + a JSPP function that draws each value as a bar chart. |
| `classes` | Declares a `Ball` class with fields and methods, instantiates a handful, and renders them. |
| `bouncing` | Animated via a user-defined `tick(t)` function; balls bounce off canvas walls every frame. |
| `3D cube` | Switches the host to Three.js mode. The JSPP `tick(dt)` function calls `setRotation`, `setScale`, and `setFaceColor` to drive a real 3D cube. |

Hit **View compiled C++** in the toolbar to pop open a viewer over the four compile-pipeline demos below (source, emitted C++, stdout) - the artifacts are fetched from `/demos/compiled/` on the deployed site.

### Compile pipeline — `demos/compiled/`

Four JSPP programs round-tripped through the **full** `jspp -> .cpp -> native binary` pipeline. Each folder commits `source.jspp`, `generated.cpp` (what the JSPP compiler emitted, verbatim), and `expected.txt` (what the compiled native binary actually printed). `demos/compiled/verify.sh` rebuilds every artifact from scratch and diffs against the committed copies, and the `jspp-pipeline` CI job runs it on every push.

The same `generated.cpp` is **also compiled to WebAssembly** via Emscripten (`demos/compiled/verify_wasm.sh` / the `jspp-pipeline` CI job / the Pages deploy). The playground has a **run wasm** tab that imports `demo.mjs` in the browser, calls `main()`, captures its stdout, and live-diffs against `expected.txt`. Same C++, two targets (native and wasm), same output.

| Demo | What it does |
|---|---|
| `hello` | Smallest possible program: `print("Hello, World!")`. Verifies `print` / string literal codegen end to end. |
| `fibonacci` | Recursive `fib(n)` for n = 0..9, printed one per line. Exercises functions, recursion, and integer codegen. |
| `classes` | Defines a `Player` class with `health`, `name`, and a `takeDamage(amount)` method; creates two instances and mutates their state. Exercises class codegen, field access, and method dispatch. |
| `demo` | A broader mix - variables, arithmetic, control flow, and string concat - to stress more of the compiler surface in a single program. |
| `mandelbrot` | A 96x64 Mandelbrot. `main()` prints the grid dimensions followed by W\*H iteration counts; the playground paints those as pixels, so you are looking at a fractal whose every sample was computed by C++ compiled to wasm from a JSPP source. Exercises nested loops, doubles, and function calls in a tight inner loop. |

Reproduce locally:

```bash
# from the JSPP repo (https://github.com/StefanDjurkic/jspp)
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel

# from this repo
demos/compiled/verify.sh /path/to/jspp/build/jspp         # native
source /path/to/emsdk/emsdk_env.sh                        # one-time
demos/compiled/verify_wasm.sh                             # wasm in node
```

## Tech stack

| Layer | Technology |
|---|---|
| Language | Rust (stable) |
| Graphics | `wgpu` (WebGPU) |
| WASM toolchain | `wasm-pack` + `wasm-bindgen` |
| ECS | `bevy_ecs` (standalone) |
| Serialization | `serde` + `bincode` |
| Networking | WebSockets |
| Assets | glTF / `.glb` |
| Math | `glam` |
| Build | Cargo workspace |

## Project layout

```
Cargo.toml        Workspace root
shared/           Types + messages shared by client and server
client/           WASM client (renderer, input, networking, scripting, UI)
server/           Authoritative game server
assets/           Models, textures, audio, animations
scripts/          Build / deploy helpers
```

## Requirements

- Rust (stable) with the `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/): `cargo install wasm-pack`
- Node.js ≥ 20 (for the browser test harness)
- Python 3 (for `scripts/generate_bootstrap_glb.py`)

## Build the WASM client

```bash
wasm-pack build client --target web
```

This produces `client/pkg/` with the `.wasm` and JS glue.

## Serve the browser client locally

Any static file server pointed at `client/` works. For example:

```bash
cd client
python -m http.server 8000
# open http://localhost:8000/index.html
```

## JSPP browser host (optional)

If you have the [JSPP](https://github.com/StefanDjurkic/jspp) repo cloned **as a sibling folder**, the ZeroEngine browser page (`client/jspp.html`) can run `.jspp` programs and execute the JSPP regression tests inside a headless Chromium.

Expected layout:

```
your-workspace/
├── jspp/          # https://github.com/StefanDjurkic/jspp
└── zeroengine/    # this repo
```

Then, from inside `client/`:

```bash
npm install            # installs Playwright
npx playwright install chromium
node test_all.mjs
```

`test_all.mjs` runs three layers:
1. A compatibility lint.
2. Node regression tests against the JSPP interpreter.
3. A Playwright Chromium run of the same tests through the browser host.

The test runners auto-detect the JSPP location by checking, in order: the `JSPP_ROOT` env var, a sibling `jspp/` folder, then a monorepo layout (JSPP at `../..`). Layers 1 and 2 work in both layouts. **Layer 3 (browser) currently assumes the monorepo layout** (`jspp/` contents served alongside `ZeroEngine/`); it will be lifted to the sibling layout in a future change — for now, either skip it with `--skip-browser` or place ZeroEngine inside a JSPP checkout when running browser tests.

If you are not using JSPP, ignore `client/jspp.html`, `client/jspp_engine_bridge.mjs`, `client/node-shims.mjs`, and the three test scripts — the rest of the engine works without them.

## Build the server

```bash
cargo build --release -p zero-engine-server
```

The server listens on a WebSocket port (see `server/src/networking/mod.rs`, default `127.0.0.1:9001`) and the client connects via `ws://`.

## Deploying the web client

`scripts/deploy_zeroengine.ps1.example` is a PowerShell template that builds the WASM client and `scp`s it to a remote host. Copy it to `scripts/deploy_zeroengine.ps1` and fill in your SSH key path, remote host, remote directory, and public URL. The real filename is gitignored so your server details do not end up in git.

## Security notes

- Do **not** commit private keys, server IPs, or domain names. The `.gitignore` excludes `scripts/deploy_zeroengine.ps1`, `.tmp-deploy/`, `.tmp-live-compare/`, `target/`, and `**/pkg/`.
- `node_modules/` is excluded; contributors install their own.

## Contributing

ZeroEngine is a fun side project and contributions are very welcome — issues, PRs, bug reports, new renderer features, test cases, or just ideas. No formal process; open an issue or PR and we'll chat.

## License

MIT — see [LICENSE](LICENSE).
