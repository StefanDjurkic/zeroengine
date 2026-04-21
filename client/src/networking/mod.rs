pub mod connection;
pub mod interpolation;
pub mod prediction;

use bevy_ecs::{resource::Resource, world::World};
use zero_engine_shared::{EngineResult, ServerMessage};

use crate::engine::{EngineResources, Module};

use self::{
    connection::{ConnectionPhase, NetworkConnection},
    interpolation::InterpolationBuffer,
    prediction::PredictionBuffer,
};

#[derive(Clone, Debug, Resource)]
struct NetworkState {
    connection: NetworkConnection,
    prediction: PredictionBuffer,
    interpolation: InterpolationBuffer,
    outbound_messages: Vec<Vec<u8>>,
    last_server_message: Option<ServerMessage>,
}

impl Default for NetworkState {
    fn default() -> Self {
        Self {
            connection: NetworkConnection::default(),
            prediction: PredictionBuffer::default(),
            interpolation: InterpolationBuffer::default(),
            outbound_messages: Vec::new(),
            last_server_message: None,
        }
    }
}

#[derive(Default)]
pub struct NetworkingModule;

impl Module for NetworkingModule {
    fn name(&self) -> &'static str {
        "networking"
    }

    fn init(&mut self, world: &mut World, _resources: &mut EngineResources) -> EngineResult<()> {
        if !world.contains_resource::<NetworkState>() {
            world.insert_resource(NetworkState::default());
        }

        Ok(())
    }

    fn update(
        &mut self,
        world: &mut World,
        _resources: &mut EngineResources,
        _dt: f32,
    ) -> EngineResult<()> {
        if let Some(mut network_state) = world.get_resource_mut::<NetworkState>() {
            network_state.connection.phase = ConnectionPhase::Disconnected;
            let _ = network_state.prediction.len();
            let _ = network_state.interpolation.latest_tick();
            network_state.outbound_messages.clear();
            network_state.last_server_message = None;
        }

        Ok(())
    }

    fn shutdown(
        &mut self,
        world: &mut World,
        _resources: &mut EngineResources,
    ) -> EngineResult<()> {
        if let Some(mut network_state) = world.get_resource_mut::<NetworkState>() {
            network_state.connection.phase = ConnectionPhase::Disconnected;
            let _ = network_state.prediction.len();
            let _ = network_state.interpolation.latest_tick();
            network_state.outbound_messages.clear();
            network_state.last_server_message = None;
        }

        Ok(())
    }
}
