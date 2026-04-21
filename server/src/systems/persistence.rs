use bevy_ecs::world::World;

/// Returns the number of entities that would be persisted by the current world snapshot.
pub fn persist_world_state(world: &World) -> usize {
    world.entities().len() as usize
}
