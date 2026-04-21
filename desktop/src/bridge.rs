//! ZeroEngine compile bridge.
//!
//! Exposes Tauri commands for:
//!   - bridge_info        : report which native tools are available (jspp, g++)
//!   - compile_jspp       : JSPP source string -> generated C++ string
//!   - run_cpp_native     : C++ source string -> { stdout, stderr, exit_code, ok }
//!   - compile_and_run    : one-shot JSPP source -> structured CompileAndRunResult
//!   - open_browser       : spawn a new webview window at a URL
//!   - pick_toolchain     : let the user point ZeroEngine at a jspp/g++ binary
//!   - read_text_file     : open .jspp / .cpp files via the file system
//!   - save_text_file     : save editor contents to disk
//!
//! Everything runs in a tempdir that is wiped after use. User source is
//! capped at MAX_SOURCE_BYTES. Compilation and execution have wall-clock
//! timeouts.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Runtime, State};
use tokio::io::AsyncWriteExt;

const MAX_SOURCE_BYTES: usize = 256 * 1024;
const COMPILE_TIMEOUT: Duration = Duration::from_secs(30);
const RUN_TIMEOUT: Duration = Duration::from_secs(10);
const STDOUT_CAP: usize = 512 * 1024;
const STDIN_CAP: usize = 64 * 1024;

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

#[derive(Default, Deserialize)]
pub struct RunOptions {
    #[serde(default)]
    pub stdin: Option<String>,
    /// One of "O0" | "O1" | "O2" | "O3" | "Os". Default "O2".
    #[serde(default)]
    pub opt_level: Option<String>,
}

/// Full pipeline result: JSPP → C++ → native exe → stdout.
/// Times are milliseconds for each stage; a stage returns 0 ms if skipped.
#[derive(Serialize)]
pub struct CompileAndRunResult {
    pub cpp: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub ok: bool,
    pub jspp_ms: u64,
    pub cxx_ms: u64,
    pub run_ms: u64,
    pub stage_failed: Option<String>, // "jspp" | "cxx" | "run" | None
}

fn normalize_opt(level: &Option<String>, is_cl: bool) -> &'static str {
    match level.as_deref() {
        Some("O0") => if is_cl { "/Od" } else { "-O0" },
        Some("O1") => if is_cl { "/O1" } else { "-O1" },
        Some("O3") => if is_cl { "/O2" } else { "-O3" },
        Some("Os") => if is_cl { "/O1" } else { "-Os" },
        _ => if is_cl { "/O2" } else { "-O2" },
    }
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
    options: Option<RunOptions>,
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
    let opts = options.unwrap_or_default();

    let scratch = fresh_scratch("cpp")?;
    let cpp_path = scratch.join("main.cpp");
    let exe_name = if cfg!(windows) { "main.exe" } else { "main" };
    let exe_path = scratch.join(exe_name);

    tokio::fs::write(&cpp_path, cpp.as_bytes())
        .await
        .map_err(|e| format!("write main.cpp: {e}"))?;

    // Build.
    let is_cl = kind == "cl";
    let opt_flag = normalize_opt(&opts.opt_level, is_cl);
    let mut cmd = tokio::process::Command::new(&cxx);
    if is_cl {
        cmd.arg("/nologo")
            .arg("/std:c++20")
            .arg(opt_flag)
            .arg("/EHsc")
            .arg(&cpp_path)
            .arg(format!("/Fe:{}", exe_path.display()));
    } else {
        cmd.arg("-std=c++20")
            .arg(opt_flag)
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

    // Run with optional stdin.
    let run = tokio::time::timeout(RUN_TIMEOUT, run_with_stdin(&exe_path, &scratch, opts.stdin.as_deref()))
        .await
        .map_err(|_| "native binary timed out".to_string())??;

    let mut stdout = String::from_utf8_lossy(&run.stdout).to_string();
    let mut stderr = String::from_utf8_lossy(&run.stderr).to_string();
    cap_string(&mut stdout, STDOUT_CAP, "stdout");
    cap_string(&mut stderr, STDOUT_CAP, "stderr");

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

/// One-shot pipeline that returns per-stage timings so the UI can show progress.
#[tauri::command]
pub async fn compile_and_run(
    state: State<'_, ToolchainState>,
    source: String,
    options: Option<RunOptions>,
) -> Result<CompileAndRunResult, String> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err(format!(
            "source too large ({} bytes > {} limit)",
            source.len(),
            MAX_SOURCE_BYTES
        ));
    }
    let tc = state.snapshot();
    let jspp = tc
        .jspp
        .clone()
        .ok_or_else(|| "jspp compiler not found.".to_string())?;
    let cxx = tc
        .cxx
        .clone()
        .ok_or_else(|| "No C++ compiler (g++/clang++/cl) available.".to_string())?;
    let kind = tc.cxx_kind.unwrap_or_else(|| "g++".to_string());
    let opts = options.unwrap_or_default();

    let scratch = fresh_scratch("pipe")?;
    let src_path = scratch.join("playground.jspp");
    let cpp_path = scratch.join("generated.cpp");
    let exe_name = if cfg!(windows) { "main.exe" } else { "main" };
    let exe_path = scratch.join(exe_name);

    tokio::fs::write(&src_path, source.as_bytes())
        .await
        .map_err(|e| format!("write source: {e}"))?;

    // Stage 1: JSPP -> C++
    let t0 = Instant::now();
    let jspp_out = tokio::time::timeout(
        COMPILE_TIMEOUT,
        tokio::process::Command::new(&jspp)
            .arg(&src_path)
            .arg("-o")
            .arg(&cpp_path)
            .current_dir(&scratch)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "jspp compile timed out".to_string())?
    .map_err(|e| format!("spawn jspp: {e}"))?;
    let jspp_ms = t0.elapsed().as_millis() as u64;

    if !jspp_out.status.success() {
        let stderr = String::from_utf8_lossy(&jspp_out.stderr).to_string();
        let _ = std::fs::remove_dir_all(&scratch);
        return Ok(CompileAndRunResult {
            cpp: String::new(),
            stdout: String::new(),
            stderr,
            exit_code: jspp_out.status.code(),
            ok: false,
            jspp_ms,
            cxx_ms: 0,
            run_ms: 0,
            stage_failed: Some("jspp".into()),
        });
    }

    let cpp = tokio::fs::read_to_string(&cpp_path)
        .await
        .map_err(|e| format!("read generated.cpp: {e}"))?;

    // Stage 2: C++ -> native
    let is_cl = kind == "cl";
    let opt_flag = normalize_opt(&opts.opt_level, is_cl);
    let mut cmd = tokio::process::Command::new(&cxx);
    if is_cl {
        cmd.arg("/nologo")
            .arg("/std:c++20")
            .arg(opt_flag)
            .arg("/EHsc")
            .arg(&cpp_path)
            .arg(format!("/Fe:{}", exe_path.display()));
    } else {
        cmd.arg("-std=c++20")
            .arg(opt_flag)
            .arg("-o")
            .arg(&exe_path)
            .arg(&cpp_path);
    }
    cmd.current_dir(&scratch)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let t1 = Instant::now();
    let build = tokio::time::timeout(COMPILE_TIMEOUT, cmd.output())
        .await
        .map_err(|_| "C++ build timed out".to_string())?
        .map_err(|e| format!("spawn {}: {e}", cxx.display()))?;
    let cxx_ms = t1.elapsed().as_millis() as u64;

    if !build.status.success() {
        let stderr = String::from_utf8_lossy(&build.stderr).to_string();
        let _ = std::fs::remove_dir_all(&scratch);
        return Ok(CompileAndRunResult {
            cpp,
            stdout: String::from_utf8_lossy(&build.stdout).to_string(),
            stderr,
            exit_code: build.status.code(),
            ok: false,
            jspp_ms,
            cxx_ms,
            run_ms: 0,
            stage_failed: Some("cxx".into()),
        });
    }

    // Stage 3: run
    let t2 = Instant::now();
    let run = tokio::time::timeout(RUN_TIMEOUT, run_with_stdin(&exe_path, &scratch, opts.stdin.as_deref()))
        .await
        .map_err(|_| "native binary timed out".to_string())??;
    let run_ms = t2.elapsed().as_millis() as u64;

    let mut stdout = String::from_utf8_lossy(&run.stdout).to_string();
    let mut stderr = String::from_utf8_lossy(&run.stderr).to_string();
    cap_string(&mut stdout, STDOUT_CAP, "stdout");
    cap_string(&mut stderr, STDOUT_CAP, "stderr");

    let ok = run.status.success();
    let exit_code = run.status.code();
    let stage_failed = if ok { None } else { Some("run".to_string()) };
    let _ = std::fs::remove_dir_all(&scratch);
    Ok(CompileAndRunResult {
        cpp,
        stdout,
        stderr,
        exit_code,
        ok,
        jspp_ms,
        cxx_ms,
        run_ms,
        stage_failed,
    })
}

struct ChildOutput {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    status: std::process::ExitStatus,
}

async fn run_with_stdin(
    exe: &std::path::Path,
    cwd: &std::path::Path,
    stdin: Option<&str>,
) -> Result<ChildOutput, String> {
    use tokio::process::Command;
    let mut cmd = Command::new(exe);
    cmd.current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("spawn binary: {e}"))?;

    if let (Some(input), Some(mut handle)) = (stdin.filter(|s| !s.is_empty()), child.stdin.take()) {
        let capped: String = input.chars().take(STDIN_CAP).collect();
        let _ = handle.write_all(capped.as_bytes()).await;
        let _ = handle.shutdown().await;
        drop(handle);
    } else if let Some(handle) = child.stdin.take() {
        drop(handle);
    }

    let out = child
        .wait_with_output()
        .await
        .map_err(|e| format!("collect output: {e}"))?;
    Ok(ChildOutput {
        stdout: out.stdout,
        stderr: out.stderr,
        status: out.status,
    })
}

fn cap_string(s: &mut String, cap: usize, label: &str) {
    if s.len() > cap {
        s.truncate(cap);
        s.push_str(&format!("\n... ({} truncated)\n", label));
    }
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

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("not a file: {}", p.display()));
    }
    let meta = tokio::fs::metadata(&p)
        .await
        .map_err(|e| format!("stat: {e}"))?;
    if meta.len() > MAX_SOURCE_BYTES as u64 * 4 {
        return Err(format!("file too large ({} bytes)", meta.len()));
    }
    tokio::fs::read_to_string(&p)
        .await
        .map_err(|e| format!("read: {e}"))
}

#[tauri::command]
pub async fn save_text_file(path: String, contents: String) -> Result<(), String> {
    if contents.len() > MAX_SOURCE_BYTES * 4 {
        return Err(format!("contents too large ({} bytes)", contents.len()));
    }
    tokio::fs::write(&path, contents.as_bytes())
        .await
        .map_err(|e| format!("write: {e}"))
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
