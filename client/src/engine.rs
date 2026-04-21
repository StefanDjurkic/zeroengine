use bevy_ecs::{resource::Resource, world::World};
use glam::{Quat, Vec2, Vec3, Vec4};
use zero_engine_shared::{Action, EngineError, EngineResult, Health, Transform, Velocity};

use crate::{
    audio::AudioModule,
    input::InputModule,
    networking::NetworkingModule,
    renderer::{
        RendererModule, camera::Camera, lighting::DirectionalLight, mesh::Mesh, texture::Material,
    },
    systems,
    ui::UiModule,
};

pub trait Module {
    /// Returns a stable module name for diagnostics and engine bookkeeping.
    fn name(&self) -> &'static str;

    /// Initializes the module and inserts any resources it owns.
    fn init(&mut self, world: &mut World, resources: &mut EngineResources) -> EngineResult<()>;

    /// Advances the module by one frame.
    fn update(
        &mut self,
        world: &mut World,
        resources: &mut EngineResources,
        dt: f32,
    ) -> EngineResult<()>;

    /// Shuts down the module and releases any owned state.
    fn shutdown(&mut self, world: &mut World, resources: &mut EngineResources) -> EngineResult<()>;
}

#[derive(Clone, Debug, Resource)]
pub struct InputState {
    pub movement: Vec2,
    pub look_delta: Vec2,
    pub actions: Vec<Action>,
}

impl Default for InputState {
    fn default() -> Self {
        Self {
            movement: Vec2::ZERO,
            look_delta: Vec2::ZERO,
            actions: Vec::new(),
        }
    }
}

#[derive(Debug, Default)]
pub struct EngineResources {
    pub(crate) frame_counter: u64,
    pub(crate) last_delta_seconds: f32,
    pub(crate) status_line: String,
}

pub struct Engine {
    world: World,
    resources: EngineResources,
    modules: Vec<Box<dyn Module>>,
    initialized: bool,
}

impl Engine {
    /// Creates a new client engine with the module layout defined by the design document.
    pub fn new() -> Self {
        let mut world = World::new();
        spawn_bootstrap_scene(&mut world);

        Self {
            world,
            resources: EngineResources {
                status_line: "Bootstrapping engine".to_string(),
                ..EngineResources::default()
            },
            modules: vec![
                Box::<InputModule>::default(),
                Box::<NetworkingModule>::default(),
                Box::<AudioModule>::default(),
                Box::<UiModule>::default(),
                Box::<RendererModule>::default(),
            ],
            initialized: false,
        }
    }

    /// Initializes all registered modules in registration order.
    pub fn initialize(&mut self) -> EngineResult<()> {
        if self.initialized {
            return Ok(());
        }

        for module in &mut self.modules {
            module.init(&mut self.world, &mut self.resources)?;
        }

        self.resources.status_line = "Engine started".to_string();
        self.initialized = true;
        Ok(())
    }

    /// Advances the engine by one frame and runs the client gameplay systems.
    pub fn update(&mut self, dt: f32) -> EngineResult<()> {
        if !self.initialized {
            return Err(EngineError::client(
                "attempted to update the engine before initialization",
            ));
        }

        self.resources.frame_counter += 1;
        self.resources.last_delta_seconds = dt;

        if let Some((renderer, modules)) = self.modules.split_last_mut() {
            for module in modules {
                module.update(&mut self.world, &mut self.resources, dt)?;
            }

            systems::run_client_systems(&mut self.world, dt);
            renderer.update(&mut self.world, &mut self.resources, dt)?;
        } else {
            systems::run_client_systems(&mut self.world, dt);
        }

        Ok(())
    }

    /// Shuts down all modules in reverse registration order.
    pub fn shutdown(&mut self) -> EngineResult<()> {
        while let Some(mut module) = self.modules.pop() {
            module.shutdown(&mut self.world, &mut self.resources)?;
        }

        self.resources.status_line = "Engine stopped".to_string();
        self.initialized = false;
        Ok(())
    }

    /// Returns the engine status string intended for logs and UI overlays.
    pub fn status_line(&self) -> &str {
        &self.resources.status_line
    }
}

fn spawn_bootstrap_scene(world: &mut World) {
    world.spawn((
        Transform::default(),
        Velocity::default(),
        Health {
            current: 100.0,
            max: 100.0,
        },
    ));

    world.spawn((
        Transform::from_glam(Vec3::new(0.0, 1.3, 6.0), Quat::IDENTITY, Vec3::ONE),
        Velocity::default(),
        Camera::default(),
    ));

    world.spawn((DirectionalLight::default(),));

    world.spawn((
        Transform::from_glam(Vec3::ZERO, Quat::IDENTITY, Vec3::splat(1.4)),
        Mesh::bootstrap_cube(),
        Material::new(Vec4::ONE, None),
    ));
}
