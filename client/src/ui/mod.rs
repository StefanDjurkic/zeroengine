use bevy_ecs::{resource::Resource, world::World};
use zero_engine_shared::EngineResult;

use crate::engine::{EngineResources, Module};

#[derive(Clone, Debug, Default, Resource)]
struct UiState {
    status_text: String,
}

#[derive(Default)]
pub struct UiModule;

impl Module for UiModule {
    fn name(&self) -> &'static str {
        "ui"
    }

    fn init(&mut self, world: &mut World, resources: &mut EngineResources) -> EngineResult<()> {
        if !world.contains_resource::<UiState>() {
            world.insert_resource(UiState {
                status_text: resources.status_line.clone(),
            });
        }

        Ok(())
    }

    fn update(
        &mut self,
        world: &mut World,
        resources: &mut EngineResources,
        _dt: f32,
    ) -> EngineResult<()> {
        if let Some(mut ui_state) = world.get_resource_mut::<UiState>() {
            ui_state.status_text = resources.status_line.clone();
        }

        Ok(())
    }

    fn shutdown(
        &mut self,
        world: &mut World,
        _resources: &mut EngineResources,
    ) -> EngineResult<()> {
        if let Some(mut ui_state) = world.get_resource_mut::<UiState>() {
            ui_state.status_text.clear();
        }

        Ok(())
    }
}
