/// Script bridge module — receives 2D draw commands from the JS++ interpreter
/// running in the same browser context, and queues them for the renderer.

use std::cell::RefCell;

/// A 2D shape command queued by JS++ script code.
#[derive(Clone, Debug)]
pub enum ShapeCommand {
    Rect {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        r: u8,
        g: u8,
        b: u8,
    },
    Circle {
        x: f32,
        y: f32,
        radius: f32,
        r: u8,
        g: u8,
        b: u8,
    },
    Line {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        r: u8,
        g: u8,
        b: u8,
    },
}

/// A snapshot of the 2D scene produced by the last script execution.
#[derive(Clone, Debug, Default)]
pub struct ScriptScene {
    pub clear_r: u8,
    pub clear_g: u8,
    pub clear_b: u8,
    pub shapes: Vec<ShapeCommand>,
    pub log_lines: Vec<String>,
}

thread_local! {
    /// The pending scene built up by JS++ draw calls.
    /// The renderer drains this each frame.
    static PENDING_SCENE: RefCell<ScriptScene> = RefCell::new(ScriptScene {
        clear_r: 18,
        clear_g: 18,
        clear_b: 22,
        shapes: Vec::new(),
        log_lines: Vec::new(),
    });
}

/// Takes the current script scene, replacing it with defaults.
pub fn take_scene() -> ScriptScene {
    PENDING_SCENE.with(|cell| {
        let mut scene = cell.borrow_mut();
        std::mem::take(&mut *scene)
    })
}

/// Returns a clone of the current script scene without draining it.
pub fn peek_scene() -> ScriptScene {
    PENDING_SCENE.with(|cell| cell.borrow().clone())
}

fn clamp_color(v: f64) -> u8 {
    (v.round().clamp(0.0, 255.0)) as u8
}

// ============================================================================
// wasm_bindgen exports — called from JavaScript by the JS++ interpreter bridge
// ============================================================================

#[cfg(target_arch = "wasm32")]
mod wasm_api {
    use super::*;
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn jspp_draw_rect(x: f64, y: f64, width: f64, height: f64, r: f64, g: f64, b: f64) {
        PENDING_SCENE.with(|cell| {
            cell.borrow_mut().shapes.push(ShapeCommand::Rect {
                x: x as f32,
                y: y as f32,
                width: width as f32,
                height: height as f32,
                r: clamp_color(r),
                g: clamp_color(g),
                b: clamp_color(b),
            });
        });
    }

    #[wasm_bindgen]
    pub fn jspp_draw_circle(x: f64, y: f64, radius: f64, r: f64, g: f64, b: f64) {
        PENDING_SCENE.with(|cell| {
            cell.borrow_mut().shapes.push(ShapeCommand::Circle {
                x: x as f32,
                y: y as f32,
                radius: radius as f32,
                r: clamp_color(r),
                g: clamp_color(g),
                b: clamp_color(b),
            });
        });
    }

    #[wasm_bindgen]
    pub fn jspp_draw_line(x1: f64, y1: f64, x2: f64, y2: f64, r: f64, g: f64, b: f64) {
        PENDING_SCENE.with(|cell| {
            cell.borrow_mut().shapes.push(ShapeCommand::Line {
                x1: x1 as f32,
                y1: y1 as f32,
                x2: x2 as f32,
                y2: y2 as f32,
                r: clamp_color(r),
                g: clamp_color(g),
                b: clamp_color(b),
            });
        });
    }

    #[wasm_bindgen]
    pub fn jspp_clear(r: f64, g: f64, b: f64) {
        PENDING_SCENE.with(|cell| {
            let mut scene = cell.borrow_mut();
            scene.clear_r = clamp_color(r);
            scene.clear_g = clamp_color(g);
            scene.clear_b = clamp_color(b);
            scene.shapes.clear();
        });
    }

    #[wasm_bindgen]
    pub fn jspp_log(message: &str) {
        PENDING_SCENE.with(|cell| {
            cell.borrow_mut().log_lines.push(message.to_string());
        });
    }

    /// Called by JS after executing a script to signal that the scene is complete.
    /// The renderer will pick up the shapes on the next frame.
    #[wasm_bindgen]
    pub fn jspp_scene_ready() {
        // Currently a no-op — the scene is already in PENDING_SCENE.
        // This exists as a future sync point if we need frame-precise commits.
    }
}
