use bevy_ecs::component::Component;
use glam::{EulerRot, Quat, Vec3};

#[derive(Component, Clone, Debug, PartialEq)]
pub struct Camera {
    pub fov_y_radians: f32,
    pub near_plane: f32,
    pub far_plane: f32,
    pub move_speed: f32,
    pub look_sensitivity: f32,
    pub yaw_radians: f32,
    pub pitch_radians: f32,
}

impl Camera {
    /// Returns the default perspective camera planned for phase two.
    pub fn perspective_default() -> Self {
        Self {
            fov_y_radians: 60.0_f32.to_radians(),
            near_plane: 0.1,
            far_plane: 1_000.0,
            move_speed: 10.0,
            look_sensitivity: 0.0025,
            yaw_radians: 0.0,
            pitch_radians: 0.0,
        }
    }

    /// Returns the camera orientation as a yaw-pitch quaternion.
    pub fn orientation(&self) -> Quat {
        Quat::from_euler(EulerRot::YXZ, self.yaw_radians, self.pitch_radians, 0.0)
    }

    /// Returns the camera forward vector in world space.
    pub fn forward_vector(&self) -> Vec3 {
        self.orientation() * -Vec3::Z
    }

    /// Returns the camera right vector in world space.
    pub fn right_vector(&self) -> Vec3 {
        self.orientation() * Vec3::X
    }
}

impl Default for Camera {
    fn default() -> Self {
        Self::perspective_default()
    }
}
