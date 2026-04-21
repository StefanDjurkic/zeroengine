use bevy_ecs::world::World;
use zero_engine_shared::{Transform, Velocity};

/// Advances authoritative transforms based on the current velocity component.
pub fn apply_authoritative_movement(world: &mut World, dt: f32) {
    let mut query = world.query::<(&mut Transform, &Velocity)>();

    for (mut transform, velocity) in query.iter_mut(world) {
        transform.translate(velocity.linear_vec3() * dt);
    }
}