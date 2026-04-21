use bevy_ecs::world::World;
use zero_engine_shared::Health;

/// Clamps health values into a valid range for client-side presentation.
pub fn resolve_combat(world: &mut World) {
    let mut query = world.query::<&mut Health>();

    for mut health in query.iter_mut(world) {
        let max_health = health.max.max(0.0);
        health.max = max_health;
        health.current = health.current.clamp(0.0, max_health);
    }
}
