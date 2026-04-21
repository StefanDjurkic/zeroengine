pub mod combat;
pub mod movement;
pub mod persistence;
pub mod validation;

use bevy_ecs::world::World;
use zero_engine_shared::{EngineResult, InputSnapshot, TICK_DURATION_SECS};

/// Runs the server-authoritative gameplay systems for one fixed tick.
pub fn run_server_systems(world: &mut World) -> EngineResult<usize> {
    movement::apply_authoritative_movement(world, TICK_DURATION_SECS);
    combat::resolve_combat(world);
    Ok(persistence::persist_world_state(world))
}

/// Validates a client input snapshot against the authoritative server rules.
pub fn validate_snapshot(snapshot: &InputSnapshot) -> EngineResult<()> {
    validation::validate_input(snapshot)
}
