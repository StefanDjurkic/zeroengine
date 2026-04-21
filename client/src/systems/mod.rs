pub mod combat;
pub mod movement;

use bevy_ecs::world::World;

/// Runs the client-side gameplay systems for the current frame.
pub fn run_client_systems(world: &mut World, dt: f32) {
    movement::apply_movement(world, dt);
    combat::resolve_combat(world);
}
