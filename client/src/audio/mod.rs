use bevy_ecs::{component::Component, resource::Resource, world::World};
use zero_engine_shared::EngineResult;

use crate::engine::{EngineResources, Module};

#[derive(Component, Clone, Debug, PartialEq)]
pub struct AudioSource {
    pub clip: String,
    pub gain: f32,
}

impl AudioSource {
    /// Creates an audio source component for a named clip.
    pub fn new(clip: impl Into<String>, gain: f32) -> Self {
        Self {
            clip: clip.into(),
            gain,
        }
    }
}

#[derive(Clone, Debug, Default, Resource)]
struct AudioBusState {
    queued_events: usize,
}

#[derive(Default)]
pub struct AudioModule;

impl Module for AudioModule {
    fn name(&self) -> &'static str {
        "audio"
    }

    fn init(&mut self, world: &mut World, _resources: &mut EngineResources) -> EngineResult<()> {
        if !world.contains_resource::<AudioBusState>() {
            world.insert_resource(AudioBusState::default());
        }

        Ok(())
    }

    fn update(
        &mut self,
        world: &mut World,
        _resources: &mut EngineResources,
        _dt: f32,
    ) -> EngineResult<()> {
        if let Some(mut bus_state) = world.get_resource_mut::<AudioBusState>() {
            bus_state.queued_events = 0;
        }

        Ok(())
    }

    fn shutdown(
        &mut self,
        world: &mut World,
        _resources: &mut EngineResources,
    ) -> EngineResult<()> {
        if let Some(mut bus_state) = world.get_resource_mut::<AudioBusState>() {
            bus_state.queued_events = 0;
        }

        Ok(())
    }
}
