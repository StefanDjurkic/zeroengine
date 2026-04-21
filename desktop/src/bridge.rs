//! ZeroEngine compile bridge.
//!
//! Exposes Tauri commands for:
//!   - bridge_info        : report which native tools are available (jspp, g++)
//!   - compile_jspp       : JSPP source string -> generated C++ string
//!   - run_cpp_native     : C++ source string -> { stdout, stderr, exit_code, ok }
//!   - open_browser       : spawn a new webview window at a URL
//!   - pick_toolchain     : let the user point ZeroEngine at a jspp/g++ binary
//!
//! Everything runs in a tempdir that is wiped after use. User source is
//! capped at MAX_SOURCE_BYTES. Compilation and execution have wall-clock
//! timeouts.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Runtime, State};

const MAX_SOURCE_BYTES: usize = 256 * 1024;
const COMPILE_TIMEOUT: Duration = Duration::from_secs(20);
const RUN_TIMEOUT: Duration = Duration::from_secs(10);
const STDOUT_CAP: usize = 512 * 1024;

#[derive(Default)]
pub struct ToolchainState {
    inner: Mutex<Toolchain>,
}

#[derive(Default, Clone, Debug, Serialize)]
pub struct Toolchain {
    pub jspp: Option<PathBuf>,
    pub cxx: Option<PathBuf>,
    pub cxx_kind: Option<String>, // "g++" | "clang++" | "cl"
}

impl ToolchainState {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn detect(&self) {
        let mut found = Toolchain::default();
        // Prefer a bundled jspp next to the executable.
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                for candidate in [
                    dir.join("jspp.exe"),
                    dir.join("jspp"),
                    dir.join("resources/jspp.exe"),
                    dir.join("resources/jspp"),
                ] {
                    if candidate.is_file() {
                        found.jspp = Some(candidate);
                        break;
                    }
                }
            }
        }
        if found.jspp.is_none() {
            if let Ok(p) = which::which("jspp") {
                found.jspp = Some(p);
            }
        }
        for (name, kind) in [("g++", "g++"), ("clang++", "clang++"), ("cl", "cl")] {
            if let Ok(p) = which::which(name) {
                found.cxx = Some(p);
                found.cxx_kind = Some(kind.to_string());
                break;
            }
        }
        *self.inner.lock().unwrap() = found;
    }

    pub fn snapshot(&self) -> Toolchain {
        self.inner.lock().unwrap().clone()
    }

    pub fn set_jspp(&self, p: PathBuf) {
        self.inner.lock().unwrap().jspp = Some(p);
    }

    pub fn set_cxx(&self, p: PathBuf, kind: String) {
        let mut s = self.inner.lock().unwrap();
        s.cxx = Some(p);
        s.cxx_kind = Some(kind);
    }
}

#[derive(Serialize)]
pub struct BridgeInfo {
    pub version: &'static str,
    pub platform: &'static str,
    pub has_jspp: bool,
    pub jspp_path: Option<String>,
    pub has_cxx: bool,
    pub cxx_path: Option<String>,
    pub cxx_kind: Option<String>,
}

#[tauri::command]
pub async fn bridge_info(state: State<'_, ToolchainState>) -> Result<BridgeInfo, String> {
    state.detect().await;
    let t = state.snapshot();
    Ok(BridgeInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        has_jspp: t.jspp.is_some(),
        jspp_path: t.jspp.map(|p| p.display().to_string()),
        has_cxx: t.cxx.is_some(),
        cxx_path: t.cxx.map(|p| p.display().to_string()),
        cxx_kind: t.cxx_kind,
    })
}

#[derive(Serialize)]
pub struct RunResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub ok: bool,
}

#[tauri::command]
pub async fn compile_jspp(
    state: State<'_, ToolchainState>,
    source: String,
) -> Result<String, String> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err(format!(
            "source too large ({} bytes > {} limit)",
            source.len(),
            MAX_SOURCE_BYTES
        ));
    }
    let jspp = state
        .snapshot()
        .jspp
        .ok_or_else(|| "jspp compiler not found. Install JSPP or use 'pick_toolchain'.".to_string())?;

    let scratch = fresh_scratch("jspp")?;
    let src_path = scratch.join("playground.jspp");
    let out_path = scratch.join("generated.cpp");
    tokio::fs::write(&src_path, source.as_bytes())
        .await
        .map_err(|e| format!("write source: {e}"))?;

    let output = tokio::time::timeout(
        COMPILE_TIMEOUT,
        tokio::process::Command::new(&jspp)
            .arg(&src_path)
            .arg("-o")
            .arg(&out_path)
            .current_dir(&scratch)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "jspp compile timed out".to_string())?
    .map_err(|e| format!("spawn jspp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = std::fs::remove_dir_all(&scratch);
        return Err(format!(
            "jspp exited with code {}:\n{}",
            output.status.code().unwrap_or(-1),
            stderr
        ));
    }

    let cpp = tokio::fs::read_to_string(&out_path)
        .await
        .map_err(|e| format!("read generated.cpp: {e}"))?;
    let _ = std::fs::remove_dir_all(&scratch);
    Ok(cpp)
}

#[tauri::command]
pub async fn run_cpp_native(
    state: State<'_, ToolchainState>,
    cpp: String,
) -> Result<RunResult, String> {
    if cpp.len() > 4 * MAX_SOURCE_BYTES {
        return Err(format!("C++ too large ({} bytes)", cpp.len()));
    }
    let tc = state.snapshot();
    let cxx = tc.cxx.ok_or_else(|| {
        "No C++ compiler on PATH (looked for g++, clang++, cl). Install one or use 'pick_toolchain'."
            .to_string()
    })?;
    let kind = tc.cxx_kind.unwrap_or_else(|| "g++".to_string());

    let scratch = fresh_scratch("cpp")?;
    let cpp_path = scratch.join("main.cpp");
    let exe_name = if cfg!(windows) { "main.exe" } else { "main" };
    let exe_path = scratch.join(exe_name);

    tokio::fs::write(&cpp_path, cpp.as_bytes())
        .await
        .map_err(|e| format!("write main.cpp: {e}"))?;

    // Build.
    let mut cmd = tokio::process::Command::new(&cxx);
    if kind == "cl" {
        cmd.arg("/nologo")
            .arg("/std:c++20")
            .arg("/O2")
            .arg("/EHsc")
            .arg(&cpp_path)
            .arg(format!("/Fe:{}", exe_path.display()));
    } else {
        cmd.arg("-std=c++20")
            .arg("-O2")
            .arg("-o")
            .arg(&exe_path)
            .arg(&cpp_path);
    }
    cmd.current_dir(&scratch)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let build = tokio::time::timeout(COMPILE_TIMEOUT, cmd.output())
        .await
        .map_err(|_| "C++ build timed out".to_string())?
        .map_err(|e| format!("spawn {}: {e}", cxx.display()))?;

    if !build.status.success() {
        let stderr = String::from_utf8_lossy(&build.stderr).to_string();
        let _ = std::fs::remove_dir_all(&scratch);
        return Ok(RunResult {
            stdout: String::from_utf8_lossy(&build.stdout).to_string(),
            stderr: format!("C++ build failed:\n{}", stderr),
            exit_code: build.status.code(),
            ok: false,
        });
    }

    // Run.
    let run = tokio::time::timeout(
        RUN_TIMEOUT,
        tokio::process::Command::new(&exe_path)
            .current_dir(&scratch)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "native binary timed out".to_string())?
    .map_err(|e| format!("spawn binary: {e}"))?;

    let mut stdout = String::from_utf8_lossy(&run.stdout).to_string();
    let mut stderr = String::from_utf8_lossy(&run.stderr).to_string();
    if stdout.len() > STDOUT_CAP {
        stdout.truncate(STDOUT_CAP);
        stdout.push_str("\n... (stdout truncated)\n");
    }
    if stderr.len() > STDOUT_CAP {
        stderr.truncate(STDOUT_CAP);
        stderr.push_str("\n... (stderr truncated)\n");
    }

    let exit_code = run.status.code();
    let ok = run.status.success();
    let _ = std::fs::remove_dir_all(&scratch);
    Ok(RunResult {
        stdout,
        stderr,
        exit_code,
        ok,
    })
}

#[tauri::command]
pub async fn open_browser<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), String> {
    let target = if url.contains("://") {
        url.clone()
    } else {
        format!("https://{}", url)
    };
    let parsed = tauri::Url::parse(&target).map_err(|e| format!("bad url: {e}"))?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let label = format!("browser-{}", nanos);
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(parsed))
        .title(format!("ZeroEngine - {}", target))
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| format!("open window: {e}"))?;
    Ok(())
}

#[derive(Deserialize)]
pub struct PickArgs {
    pub kind: String, // "jspp" or "cxx"
    pub path: String,
}

#[tauri::command]
pub async fn pick_toolchain(
    state: State<'_, ToolchainState>,
    args: PickArgs,
) -> Result<Toolchain, String> {
    let p = PathBuf::from(&args.path);
    if !p.is_file() {
        return Err(format!("not a file: {}", p.display()));
    }
    match args.kind.as_str() {
        "jspp" => state.set_jspp(p),
        "cxx" => {
            let kind = if args.path.ends_with("cl.exe") || args.path.ends_with("cl") {
                "cl".to_string()
            } else if args.path.contains("clang") {
                "clang++".to_string()
            } else {
                "g++".to_string()
            };
            state.set_cxx(p, kind);
        }
        other => return Err(format!("unknown toolchain kind: {}", other)),
    }
    Ok(state.snapshot())
}

fn fresh_scratch(tag: &str) -> Result<PathBuf, String> {
    let base = std::env::temp_dir().join("zeroengine-bridge");
    std::fs::create_dir_all(&base).map_err(|e| format!("mkdir base: {e}"))?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = base.join(format!("{}-{}", tag, nanos));
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir scratch: {e}"))?;
    Ok(dir)
}
