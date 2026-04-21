use bevy_ecs::component::Component;
use glam::{Quat, Vec3};
use serde::{Deserialize, Serialize};

#[derive(Component, Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Transform {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

impl Transform {
    /// Creates a transform from glam math types for internal engine use.
    pub fn from_glam(position: Vec3, rotation: Quat, scale: Vec3) -> Self {
        Self {
            position: position.to_array(),
            rotation: rotation.to_array(),
            scale: scale.to_array(),
        }
    }

    /// Returns the position as a glam vector.
    pub fn position_vec3(&self) -> Vec3 {
        Vec3::from_array(self.position)
    }

    /// Returns the rotation as a glam quaternion.
    pub fn rotation_quat(&self) -> Quat {
        Quat::from_array(self.rotation)
    }

    /// Returns the scale as a glam vector.
    pub fn scale_vec3(&self) -> Vec3 {
        Vec3::from_array(self.scale)
    }

    /// Applies a translation to the transform position.
    pub fn translate(&mut self, delta: Vec3) {
        self.position = (self.position_vec3() + delta).to_array();
    }
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            position: Vec3::ZERO.to_array(),
            rotation: Quat::IDENTITY.to_array(),
            scale: Vec3::ONE.to_array(),
        }
    }
}

#[derive(Component, Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Velocity {
    pub linear: [f32; 3],
    pub angular: [f32; 3],
}

impl Velocity {
    /// Creates a velocity from glam math types for shared simulation code.
    pub fn from_glam(linear: Vec3, angular: Vec3) -> Self {
        Self {
            linear: linear.to_array(),
            angular: angular.to_array(),
        }
    }

    /// Returns the linear velocity as a glam vector.
    pub fn linear_vec3(&self) -> Vec3 {
        Vec3::from_array(self.linear)
    }

    /// Returns the angular velocity as a glam vector.
    pub fn angular_vec3(&self) -> Vec3 {
        Vec3::from_array(self.angular)
    }
}

impl Default for Velocity {
    fn default() -> Self {
        Self {
            linear: Vec3::ZERO.to_array(),
            angular: Vec3::ZERO.to_array(),
        }
    }
}

#[derive(Component, Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Health {
    pub current: f32,
    pub max: f32,
}

impl Health {
    /// Returns true when the entity has no health remaining.
    pub fn is_depleted(&self) -> bool {
        self.current <= 0.0
    }

    /// Applies damage without allowing health to underflow.
    pub fn apply_damage(&mut self, amount: f32) {
        self.current = (self.current - amount).max(0.0);
    }
}

#[derive(Component, Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlayerInfo {
    pub entity_id: u64,
    pub display_name: String,
}