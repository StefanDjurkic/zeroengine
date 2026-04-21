use bevy_ecs::world::World;
use glam::{Vec2, Vec3};
use zero_engine_shared::{MAX_PLAYER_SPEED, Transform, Velocity};

use crate::{engine::InputState, renderer::camera::Camera};

/// Applies client-side camera movement using the current input resource.
pub fn apply_movement(world: &mut World, dt: f32) {
    let (movement, look_delta) = world
        .get_resource::<InputState>()
        .map(|input_state| (input_state.movement, input_state.look_delta))
        .unwrap_or((Vec2::ZERO, Vec2::ZERO));

    let mut query = world.query::<(&mut Transform, &mut Velocity, &mut Camera)>();

    for (mut transform, mut velocity, mut camera) in query.iter_mut(world) {
        camera.yaw_radians -= look_delta.x * camera.look_sensitivity;
        camera.pitch_radians =
            (camera.pitch_radians - look_delta.y * camera.look_sensitivity).clamp(-1.45, 1.45);

        let orientation = camera.orientation();
        transform.rotation = orientation.to_array();

        let forward = camera.forward_vector();
        let right = camera.right_vector();
        let flat_forward = Vec3::new(forward.x, 0.0, forward.z).normalize_or_zero();
        let flat_right = Vec3::new(right.x, 0.0, right.z).normalize_or_zero();
        let desired_direction =
            (flat_right * movement.x + flat_forward * movement.y).normalize_or_zero();
        let desired_velocity = desired_direction * camera.move_speed.min(MAX_PLAYER_SPEED);
        velocity.linear = desired_velocity.to_array();
        transform.translate(desired_velocity * dt);
    }
}

#[cfg(test)]
mod tests {
    use bevy_ecs::world::World;
    use glam::Vec2;
    use zero_engine_shared::{Transform, Velocity};

    use super::apply_movement;
    use crate::{engine::InputState, renderer::camera::Camera};

    #[test]
    fn movement_updates_camera_position() {
        let mut world = World::new();
        world.insert_resource(InputState {
            movement: Vec2::new(0.0, 1.0),
            look_delta: Vec2::new(20.0, -10.0),
            ..InputState::default()
        });

        let entity = world
            .spawn((Transform::default(), Velocity::default(), Camera::default()))
            .id();
        apply_movement(&mut world, 0.5);

        let transform = world
            .get::<Transform>(entity)
            .expect("transform should still exist after movement");
        let velocity = world
            .get::<Velocity>(entity)
            .expect("velocity should still exist after movement");

        assert!(transform.position[2] < 0.0);
        assert!(velocity.linear[2] < 0.0);
        assert_ne!(transform.rotation[1], 0.0);
    }
}
