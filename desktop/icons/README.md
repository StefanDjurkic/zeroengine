# Icons

Tauri needs the following files to build the desktop installer:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

Run:

```
cargo tauri icon path/to/icon.png --output desktop/icons
```

Or drop a 1024x1024 `icon.png` into this folder and the CI workflow will
auto-generate the rest via `@tauri-apps/cli`'s `icon` subcommand.

Until icons are provided, `cargo tauri build` will fail with a helpful
"icon not found" error. The Rust backend itself still compiles fine
(`cargo check -p zero_engine_desktop`).
