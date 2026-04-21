use bevy_ecs::world::World;
use glam::Vec2;
use zero_engine_shared::EngineResult;

#[cfg(target_arch = "wasm32")]
use std::{cell::RefCell, rc::Rc};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::{JsCast, closure::Closure};

#[cfg(target_arch = "wasm32")]
use web_sys::{HtmlCanvasElement, HtmlElement, KeyboardEvent, MouseEvent, Window};

#[cfg(target_arch = "wasm32")]
use zero_engine_shared::EngineError;

use crate::engine::{EngineResources, InputState, Module};

pub struct InputModule {
    #[cfg(target_arch = "wasm32")]
    browser_bindings: Option<BrowserInputBindings>,
}

#[cfg(target_arch = "wasm32")]
#[derive(Default)]
struct BrowserInputState {
    move_forward: bool,
    move_backward: bool,
    move_left: bool,
    move_right: bool,
    accumulated_look: Vec2,
}

#[cfg(target_arch = "wasm32")]
struct BrowserInputBindings {
    shared_state: Rc<RefCell<BrowserInputState>>,
    window: Window,
    canvas: HtmlCanvasElement,
    keydown: Closure<dyn FnMut(KeyboardEvent)>,
    keyup: Closure<dyn FnMut(KeyboardEvent)>,
    mousemove: Closure<dyn FnMut(MouseEvent)>,
    click: Closure<dyn FnMut(MouseEvent)>,
}

impl Default for InputModule {
    fn default() -> Self {
        Self {
            #[cfg(target_arch = "wasm32")]
            browser_bindings: None,
        }
    }
}

#[cfg(target_arch = "wasm32")]
impl BrowserInputBindings {
    fn teardown(self) {
        let _ = self
            .window
            .remove_event_listener_with_callback("keydown", self.keydown.as_ref().unchecked_ref());
        let _ = self
            .window
            .remove_event_listener_with_callback("keyup", self.keyup.as_ref().unchecked_ref());
        let _ = self.window.remove_event_listener_with_callback(
            "mousemove",
            self.mousemove.as_ref().unchecked_ref(),
        );
        let _ = self
            .canvas
            .remove_event_listener_with_callback("click", self.click.as_ref().unchecked_ref());
    }
}

#[cfg(target_arch = "wasm32")]
impl InputModule {
    fn ensure_browser_bindings(&mut self) -> EngineResult<()> {
        if self.browser_bindings.is_some() {
            return Ok(());
        }

        let window = web_sys::window()
            .ok_or_else(|| EngineError::browser("browser window was not available"))?;
        let document = window
            .document()
            .ok_or_else(|| EngineError::browser("browser document was not available"))?;
        let canvas = document
            .get_element_by_id("engine-canvas")
            .ok_or_else(|| EngineError::browser("engine canvas element was not found"))?
            .dyn_into::<HtmlCanvasElement>()
            .map_err(|_| EngineError::browser("engine canvas element had the wrong type"))?;
        let shared_state = Rc::new(RefCell::new(BrowserInputState::default()));

        let keydown_state = shared_state.clone();
        let keydown = Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if apply_key_state(event.code().as_str(), &mut keydown_state.borrow_mut(), true) {
                event.prevent_default();
            }
        }) as Box<dyn FnMut(KeyboardEvent)>);
        window
            .add_event_listener_with_callback("keydown", keydown.as_ref().unchecked_ref())
            .map_err(|_| EngineError::browser("failed to register keydown listener"))?;

        let keyup_state = shared_state.clone();
        let keyup = Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if apply_key_state(event.code().as_str(), &mut keyup_state.borrow_mut(), false) {
                event.prevent_default();
            }
        }) as Box<dyn FnMut(KeyboardEvent)>);
        window
            .add_event_listener_with_callback("keyup", keyup.as_ref().unchecked_ref())
            .map_err(|_| EngineError::browser("failed to register keyup listener"))?;

        let mousemove_state = shared_state.clone();
        let canvas_id = canvas.id();
        let mousemove = Closure::wrap(Box::new(move |event: MouseEvent| {
            if is_pointer_locked_to(&canvas_id) {
                let mut state = mousemove_state.borrow_mut();
                state.accumulated_look +=
                    Vec2::new(event.movement_x() as f32, event.movement_y() as f32);
            }
        }) as Box<dyn FnMut(MouseEvent)>);
        window
            .add_event_listener_with_callback("mousemove", mousemove.as_ref().unchecked_ref())
            .map_err(|_| EngineError::browser("failed to register mousemove listener"))?;

        let click_canvas = canvas.clone();
        let click = Closure::wrap(Box::new(move |_event: MouseEvent| {
            let html_element: HtmlElement = click_canvas.clone().unchecked_into();
            html_element.request_pointer_lock();
        }) as Box<dyn FnMut(MouseEvent)>);
        canvas
            .add_event_listener_with_callback("click", click.as_ref().unchecked_ref())
            .map_err(|_| EngineError::browser("failed to register canvas click listener"))?;

        self.browser_bindings = Some(BrowserInputBindings {
            shared_state,
            window,
            canvas,
            keydown,
            keyup,
            mousemove,
            click,
        });

        Ok(())
    }
}

#[cfg(target_arch = "wasm32")]
fn apply_key_state(code: &str, state: &mut BrowserInputState, pressed: bool) -> bool {
    match code {
        "KeyW" => {
            state.move_forward = pressed;
            true
        }
        "KeyS" => {
            state.move_backward = pressed;
            true
        }
        "KeyA" => {
            state.move_left = pressed;
            true
        }
        "KeyD" => {
            state.move_right = pressed;
            true
        }
        _ => false,
    }
}

#[cfg(target_arch = "wasm32")]
fn is_pointer_locked_to(canvas_id: &str) -> bool {
    web_sys::window()
        .and_then(|window| window.document())
        .and_then(|document| document.pointer_lock_element())
        .map(|element| element.id() == canvas_id)
        .unwrap_or(false)
}

impl Module for InputModule {
    fn name(&self) -> &'static str {
        "input"
    }

    fn init(&mut self, world: &mut World, _resources: &mut EngineResources) -> EngineResult<()> {
        if !world.contains_resource::<InputState>() {
            world.insert_resource(InputState::default());
        }

        #[cfg(target_arch = "wasm32")]
        self.ensure_browser_bindings()?;

        Ok(())
    }

    fn update(
        &mut self,
        world: &mut World,
        _resources: &mut EngineResources,
        _dt: f32,
    ) -> EngineResult<()> {
        if let Some(mut input_state) = world.get_resource_mut::<InputState>() {
            #[cfg(target_arch = "wasm32")]
            {
                self.ensure_browser_bindings()?;

                if let Some(bindings) = &self.browser_bindings {
                    let mut browser_state = bindings.shared_state.borrow_mut();
                    let mut movement = Vec2::ZERO;

                    if browser_state.move_left {
                        movement.x -= 1.0;
                    }
                    if browser_state.move_right {
                        movement.x += 1.0;
                    }
                    if browser_state.move_forward {
                        movement.y += 1.0;
                    }
                    if browser_state.move_backward {
                        movement.y -= 1.0;
                    }

                    input_state.movement = movement.normalize_or_zero();
                    input_state.look_delta = browser_state.accumulated_look;
                    browser_state.accumulated_look = Vec2::ZERO;
                }
            }

            #[cfg(not(target_arch = "wasm32"))]
            {
                input_state.look_delta = Vec2::ZERO;
            }
        }

        Ok(())
    }

    fn shutdown(
        &mut self,
        world: &mut World,
        _resources: &mut EngineResources,
    ) -> EngineResult<()> {
        #[cfg(target_arch = "wasm32")]
        if let Some(bindings) = self.browser_bindings.take() {
            bindings.teardown();
        }

        if let Some(mut input_state) = world.get_resource_mut::<InputState>() {
            input_state.movement = Vec2::ZERO;
            input_state.look_delta = Vec2::ZERO;
            input_state.actions.clear();
        }

        Ok(())
    }
}
