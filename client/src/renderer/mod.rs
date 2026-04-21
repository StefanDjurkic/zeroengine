pub mod animation;
pub mod camera;
pub mod lighting;
pub mod mesh;
pub(crate) mod overlay;
pub mod pipeline;
pub mod texture;

#[cfg(target_arch = "wasm32")]
mod web;

#[cfg(target_arch = "wasm32")]
use std::{cell::RefCell, rc::Rc};

use bevy_ecs::world::World;
use zero_engine_shared::{EngineResult, Transform};

#[cfg(target_arch = "wasm32")]
use glam::{Mat4, Quat, Vec3, Vec4};

#[cfg(target_arch = "wasm32")]
use zero_engine_shared::EngineError;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen_futures::spawn_local;

#[cfg(target_arch = "wasm32")]
use self::web::WebRenderer;

use crate::engine::{EngineResources, Module};

#[cfg(target_arch = "wasm32")]
pub(super) struct RenderScene {
    pub camera: CameraRenderData,
    pub light: LightRenderData,
    pub object: ObjectRenderData,
}

#[cfg(target_arch = "wasm32")]
pub(super) struct CameraRenderData {
    pub position: Vec3,
    pub rotation: Quat,
    pub fov_y_radians: f32,
    pub near_plane: f32,
    pub far_plane: f32,
}

#[cfg(target_arch = "wasm32")]
pub(super) struct LightRenderData {
    pub direction: Vec3,
    pub color: Vec3,
}

#[cfg(target_arch = "wasm32")]
pub(super) struct ObjectRenderData {
    pub model_matrix: Mat4,
    pub normal_matrix: Mat4,
    pub base_color: Vec4,
}

pub struct RendererModule {
    visible_entities: usize,

    #[cfg(target_arch = "wasm32")]
    web_state: Rc<RefCell<WebRendererState>>,
}

#[cfg(target_arch = "wasm32")]
enum WebRendererState {
    Uninitialized,
    Initializing,
    Ready(WebRenderer),
    Failed(String),
}

impl Default for RendererModule {
    fn default() -> Self {
        Self {
            visible_entities: 0,

            #[cfg(target_arch = "wasm32")]
            web_state: Rc::new(RefCell::new(WebRendererState::Uninitialized)),
        }
    }
}

impl RendererModule {
    #[cfg(target_arch = "wasm32")]
    fn begin_web_initialization(&self, bootstrap_asset_path: String) {
        {
            let mut web_state = self.web_state.borrow_mut();
            if !matches!(*web_state, WebRendererState::Uninitialized) {
                return;
            }

            *web_state = WebRendererState::Initializing;
        }

        let shared_state = self.web_state.clone();
        spawn_local(async move {
            let next_state = match WebRenderer::initialize(&bootstrap_asset_path).await {
                Ok(renderer) => WebRendererState::Ready(renderer),
                Err(error) => WebRendererState::Failed(error.to_string()),
            };

            *shared_state.borrow_mut() = next_state;
        });
    }
}

impl Module for RendererModule {
    fn name(&self) -> &'static str {
        "renderer"
    }

    fn init(&mut self, world: &mut World, resources: &mut EngineResources) -> EngineResult<()> {
        #[cfg(target_arch = "wasm32")]
        self.begin_web_initialization(bootstrap_mesh_asset_path(world)?);

        #[cfg(not(target_arch = "wasm32"))]
        let _ = world;

        resources.status_line = "Renderer initializing".to_string();
        Ok(())
    }

    fn update(
        &mut self,
        world: &mut World,
        resources: &mut EngineResources,
        _dt: f32,
    ) -> EngineResult<()> {
        let mut query = world.query::<(&Transform, &mesh::Mesh, &texture::Material)>();
        self.visible_entities = query.iter(world).count();

        #[cfg(target_arch = "wasm32")]
        {
            let mut pending_asset_path = None;

            {
                let mut web_state = self.web_state.borrow_mut();
                match &mut *web_state {
                    WebRendererState::Uninitialized => {
                        pending_asset_path = Some(bootstrap_mesh_asset_path(world)?);
                        resources.status_line =
                            "Renderer waiting for WebGPU initialization".to_string();
                    }
                    WebRendererState::Initializing => {
                        resources.status_line = "Renderer initializing WebGPU".to_string();
                    }
                    WebRendererState::Ready(renderer) => {
                        let scene = extract_render_scene(world)?;
                        renderer.render(&scene)?;
                        resources.status_line = format!(
                            "Phase 3 imported model live with {} renderable entities. Click the scene to capture the mouse and use WASD.",
                            self.visible_entities
                        );
                    }
                    WebRendererState::Failed(message) => {
                        return Err(EngineError::client(format!(
                            "renderer initialization failed: {message}"
                        )));
                    }
                }
            }

            if let Some(asset_path) = pending_asset_path {
                self.begin_web_initialization(asset_path);
            }
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            resources.status_line = format!(
                "Renderer ready for web build with {} renderable entities",
                self.visible_entities
            );
        }

        Ok(())
    }

    fn shutdown(
        &mut self,
        _world: &mut World,
        _resources: &mut EngineResources,
    ) -> EngineResult<()> {
        self.visible_entities = 0;

        #[cfg(target_arch = "wasm32")]
        {
            *self.web_state.borrow_mut() = WebRendererState::Uninitialized;
        }

        Ok(())
    }
}

#[cfg(target_arch = "wasm32")]
fn bootstrap_mesh_asset_path(world: &mut World) -> EngineResult<String> {
    let mut mesh_query = world.query::<&mesh::Mesh>();
    mesh_query
        .iter(world)
        .next()
        .map(|mesh| mesh.asset_path.clone())
        .ok_or_else(|| EngineError::client("renderer could not find a mesh asset to initialize"))
}

#[cfg(target_arch = "wasm32")]
fn extract_render_scene(world: &mut World) -> EngineResult<RenderScene> {
    let (camera_transform, camera_component) = {
        let mut camera_query = world.query::<(&Transform, &camera::Camera)>();
        camera_query
            .iter(world)
            .next()
            .map(|(transform, camera)| (transform.clone(), camera.clone()))
            .ok_or_else(|| EngineError::client("renderer could not find a camera entity"))?
    };
    let light_component = {
        let mut light_query = world.query::<&lighting::DirectionalLight>();
        light_query
            .iter(world)
            .next()
            .cloned()
            .ok_or_else(|| EngineError::client("renderer could not find a directional light"))?
    };
    let (object_transform, material) = {
        let mut object_query = world.query::<(&Transform, &mesh::Mesh, &texture::Material)>();
        object_query
            .iter(world)
            .next()
            .map(|(transform, _mesh, material)| (transform.clone(), material.clone()))
            .ok_or_else(|| EngineError::client("renderer could not find a renderable entity"))?
    };

    let model_matrix = Mat4::from_scale_rotation_translation(
        object_transform.scale_vec3(),
        object_transform.rotation_quat(),
        object_transform.position_vec3(),
    );
    let normal_matrix = if model_matrix.determinant().abs() > f32::EPSILON {
        model_matrix.inverse().transpose()
    } else {
        Mat4::IDENTITY
    };

    Ok(RenderScene {
        camera: CameraRenderData {
            position: camera_transform.position_vec3(),
            rotation: camera_transform.rotation_quat(),
            fov_y_radians: camera_component.fov_y_radians,
            near_plane: camera_component.near_plane,
            far_plane: camera_component.far_plane,
        },
        light: LightRenderData {
            direction: light_component.direction.normalize_or_zero(),
            color: light_component.color * light_component.intensity,
        },
        object: ObjectRenderData {
            model_matrix,
            normal_matrix,
            base_color: material.base_color,
        },
    })
}
