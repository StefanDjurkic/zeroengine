//! Local HTTP bridge server.
//!
//! Exposes the JSPP→C++→run pipeline over HTTP so web clients (like the
//! GitHub Pages build of the playground) can reach the desktop app's
//! native toolchain when both run on the same machine.
//!
//! # Security
//!
//! The server binds only to `127.0.0.1` and validates the `Origin` header
//! of every mutating request against a hardcoded allowlist. This prevents
//! a drive-by page from invoking the compiler on the user's machine while
//! still letting the official web playground and local development
//! origins drive compiles.
//!
//! ## Allowed origins
//!
//! * `https://stefandjurkic.github.io` — the deployed GitHub Pages site.
//! * `http://localhost:*` / `http://127.0.0.1:*` — local dev servers.
//! * `tauri://localhost` / `https://tauri.localhost` — the desktop shell
//!   itself (so the shell can talk to the server for diagnostics).
//! * `null` — `file://` pages; useful when a user double-clicks the
//!   bundled `index.html` directly.
//!
//! # Endpoints
//!
//! * `GET /info` — toolchain status, like the `bridge_info` Tauri
//!   command. Unauthenticated.
//! * `POST /compile` — JSON body `{ source, options? }`. Returns the
//!   same shape as `compile_and_run`'s Tauri result.

use std::net::SocketAddr;

use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::bridge::{self, RunOptions, Toolchain, ToolchainState};

/// Default port for the local bridge. Picked from the user-range (>1024)
/// and unlikely to collide with common dev servers.
pub const DEFAULT_PORT: u16 = 17849;

/// Origins allowed to call mutating endpoints. Kept deliberately short.
const ALLOWED_ORIGINS: &[&str] = &[
    "https://stefandjurkic.github.io",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:3000",
    "tauri://localhost",
    "https://tauri.localhost",
];

#[derive(Clone)]
struct AppState {
    toolchain: ToolchainState,
}

#[derive(Serialize)]
struct InfoResponse {
    version: &'static str,
    platform: &'static str,
    has_jspp: bool,
    jspp_path: Option<String>,
    has_cxx: bool,
    cxx_path: Option<String>,
    cxx_kind: Option<String>,
    allowed_origins: &'static [&'static str],
    default_port: u16,
}

#[derive(Deserialize)]
struct CompileRequest {
    source: String,
    #[serde(default)]
    options: Option<RunOptions>,
}

/// Check whether the request's Origin header is on the allowlist.
/// Missing Origin is rejected for mutating endpoints.
fn origin_allowed(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) else {
        return false;
    };
    if origin == "null" {
        return true; // file:// pages
    }
    ALLOWED_ORIGINS.iter().any(|a| *a == origin)
}

async fn info_handler(State(s): State<AppState>) -> impl IntoResponse {
    s.toolchain.detect().await;
    let tc: Toolchain = s.toolchain.snapshot();
    Json(InfoResponse {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        has_jspp: tc.jspp.is_some(),
        jspp_path: tc.jspp.map(|p| p.display().to_string()),
        has_cxx: tc.cxx.is_some(),
        cxx_path: tc.cxx.map(|p| p.display().to_string()),
        cxx_kind: tc.cxx_kind,
        allowed_origins: ALLOWED_ORIGINS,
        default_port: DEFAULT_PORT,
    })
}

async fn compile_handler(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CompileRequest>,
) -> impl IntoResponse {
    if !origin_allowed(&headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "origin not allowed",
                "hint": "Open the playground from an allowlisted origin (e.g. https://stefandjurkic.github.io) to use the local C++ bridge."
            })),
        )
            .into_response();
    }
    let tc = s.toolchain.snapshot();
    match bridge::compile_and_run_core(tc, req.source, req.options).await {
        Ok(result) => (StatusCode::OK, Json(serde_json::to_value(&result).unwrap())).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

/// Start the bridge HTTP server on 127.0.0.1:port. Spawns a background
/// tokio task; returns the bound SocketAddr on success.
pub async fn start(
    toolchain: ToolchainState,
    port: u16,
) -> Result<SocketAddr, String> {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any)
        .allow_origin(AllowOrigin::list(
            ALLOWED_ORIGINS
                .iter()
                .map(|o| o.parse().unwrap())
                .collect::<Vec<_>>(),
        ));

    let state = AppState { toolchain };
    let app = Router::new()
        .route("/info", get(info_handler))
        .route("/compile", post(compile_handler))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("bind {addr}: {e}"))?;
    let bound = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?;

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[bridge_server] serve error: {e}");
        }
    });

    Ok(bound)
}
