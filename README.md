# ZeroEngine

[![CI](https://github.com/StefanDjurkic/zeroengine/actions/workflows/ci.yml/badge.svg)](https://github.com/StefanDjurkic/zeroengine/actions/workflows/ci.yml)
[![Deploy](https://github.com/StefanDjurkic/zeroengine/actions/workflows/pages.yml/badge.svg)](https://github.com/StefanDjurkic/zeroengine/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**🎮 Live demo:** https://stefandjurkic.github.io/zeroengine/ — spins up the WebAssembly runtime and renders the 3D cube straight from the browser.

A browser-native game engine prototype written in Rust, targeting WebAssembly + WebGPU via [`wgpu`](https://github.com/gfx-rs/wgpu). Client and server share a single Rust workspace so network messages, components, and constants are compile-time checked on both sides.

ZeroEngine is also the **browser host** for the [JSPP](https://github.com/StefanDjurkic/jspp) language. JSPP programs can run in the ZeroEngine browser page and use its drawing builtins (`drawRect`, `drawCircle`, `drawLine`, `clear`).

> This is experimental, pre-alpha code. Expect breakage.

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
