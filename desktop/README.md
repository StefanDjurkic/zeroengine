# ZeroEngine Desktop

Tauri 2 shell that bundles:

- **Home**: entry screen with tiles for Playground, Browser, and the
  compile-bridge status.
- **Playground**: opens `client/jspp.html` inside the shell. The
  "Run as compiled C++" button feature-detects `window.__TAURI__` and,
  when present, calls the Rust bridge commands `compile_jspp` + 
  `run_cpp_native` to compile and execute real C++ locally.
- **Browser mode**: opens any URL in a new Tauri webview window, so
  ZeroEngine works as a general-purpose browser too.

## Prerequisites

- Rust (stable, with `rustup`)
- `cargo-tauri` (`cargo install tauri-cli --version ^2`)
- A C++20-capable compiler on `PATH` (`g++`, `clang++`, or MSVC `cl`)
- The `jspp` compiler binary next to the app executable, or on `PATH`
- Platform prerequisites for Tauri (see
  https://tauri.app/start/prerequisites/)

## Dev

```
cd desktop
cargo tauri dev
```

## Build installers

```
cargo tauri build
```

Installers are written to `target/release/bundle/`.

## Layout

- `src/main.rs`       - Tauri entry point and window setup
- `src/bridge.rs`     - Compile bridge (JSPP -> C++ -> native run)
- `tauri.conf.json`   - Tauri v2 config, points `frontendDist` at `../client`
- `capabilities/`     - Window permission sets
- `icons/`            - App icons (see `icons/README.md`)
- `resources/`        - Files bundled next to the executable
                        (drop `jspp.exe` / `jspp` here to ship it with
                        the installer)

## Bundling the JSPP compiler

To ship `jspp` inside the installer, copy the binary into
`desktop/resources/`:

```
cp ../build/jspp.exe desktop/resources/jspp.exe       # from the Ex repo
```

The path glob `resources/jspp*` in `tauri.conf.json` captures any OS
variant. At startup the Rust bridge looks next to the executable first,
then falls back to `which("jspp")`.
