pub mod audio;
pub mod engine;
pub mod input;
pub mod networking;
pub mod renderer;
pub mod scripting;
pub mod systems;
pub mod ui;

pub use engine::{Engine, InputState};

use zero_engine_shared::EngineResult;

#[cfg(target_arch = "wasm32")]
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::{JsCast, closure::Closure};

#[cfg(target_arch = "wasm32")]
use zero_engine_shared::EngineError;

/// Builds a client engine instance using the phase-zero module registry.
pub fn build_engine() -> Engine {
    Engine::new()
}

/// Initializes the client engine in native environments for smoke tests and tooling.
pub fn start_native() -> EngineResult<()> {
    let mut engine = build_engine();
    engine.initialize()?;
    log_info(engine.status_line());
    engine.update(0.0)?;
    Ok(())
}

/// Initializes the browser client and starts the browser render loop.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn start() -> Result<(), wasm_bindgen::JsValue> {
    let engine = Rc::new(RefCell::new(build_engine()));

    {
        let mut engine_ref = engine.borrow_mut();
        engine_ref.initialize().map_err(map_js_error)?;
        log_info(engine_ref.status_line());
        set_status_text(engine_ref.status_line());
    }

    start_frame_loop(engine)?;
    Ok(())
}

#[cfg(target_arch = "wasm32")]
fn start_frame_loop(engine: Rc<RefCell<Engine>>) -> Result<(), wasm_bindgen::JsValue> {
    let window = browser_window().map_err(map_js_error)?;
    let last_frame_millis = Rc::new(Cell::new(js_sys::Date::now()));
    let last_status = Rc::new(RefCell::new(String::new()));
    let interval_handle = Rc::new(Cell::new(-1));

    let closure_engine = engine.clone();
    let closure_last_frame_millis = last_frame_millis.clone();
    let closure_last_status = last_status.clone();
    let closure_interval_handle = interval_handle.clone();

    let tick = Closure::wrap(Box::new(move || {
        let now = js_sys::Date::now();
        let dt = ((now - closure_last_frame_millis.get()) / 1_000.0).max(0.0) as f32;
        closure_last_frame_millis.set(now);

        let update_result = {
            let mut engine_ref = closure_engine.borrow_mut();
            engine_ref.update(dt)
        };

        match update_result {
            Ok(()) => {
                let current_status = {
                    let engine_ref = closure_engine.borrow();
                    engine_ref.status_line().to_string()
                };
                let mut last_status_value = closure_last_status.borrow_mut();
                if *last_status_value != current_status {
                    log_info(&current_status);
                    set_status_text(&current_status);
                    *last_status_value = current_status;
                }
            }
            Err(error) => {
                let message = format!("Engine error: {error}");
                log_error(&message);
                set_status_text(&message);

                if let Some(window) = web_sys::window() {
                    let handle = closure_interval_handle.get();
                    if handle >= 0 {
                        window.clear_interval_with_handle(handle);
                    }
                }
            }
        }
    }) as Box<dyn FnMut()>);

    let handle = window.set_interval_with_callback_and_timeout_and_arguments_0(
        tick.as_ref().unchecked_ref(),
        16,
    )?;
    interval_handle.set(handle);
    tick.forget();
    Ok(())
}

#[cfg(target_arch = "wasm32")]
fn map_js_error(error: EngineError) -> wasm_bindgen::JsValue {
    wasm_bindgen::JsValue::from_str(&error.to_string())
}

#[cfg(target_arch = "wasm32")]
fn browser_window() -> EngineResult<web_sys::Window> {
    web_sys::window().ok_or_else(|| EngineError::browser("browser window was not available"))
}

#[cfg(target_arch = "wasm32")]
fn set_status_text(message: &str) {
    if let Some(document) = web_sys::window().and_then(|window| window.document()) {
        if let Some(element) = document.get_element_by_id("status") {
            element.set_text_content(Some(message));
        }
    }
}

#[cfg(target_arch = "wasm32")]
fn log_info(message: &str) {
    web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(message));
}

#[cfg(target_arch = "wasm32")]
fn log_error(message: &str) {
    web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(message));
}

#[cfg(not(target_arch = "wasm32"))]
fn log_info(message: &str) {
    println!("{message}");
}
