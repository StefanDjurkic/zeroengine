use bevy_ecs::component::Component;
use glam::Vec3;

#[derive(Component, Clone, Debug, PartialEq)]
pub struct DirectionalLight {
    pub direction: Vec3,
    pub color: Vec3,
    pub intensity: f32,
}

impl Default for DirectionalLight {
    fn default() -> Self {
        Self {
            direction: Vec3::new(-0.5, -1.0, -0.25).normalize_or_zero(),
            color: Vec3::ONE,
            intensity: 5.0,
        }
    }
}