use bevy_ecs::component::Component;
use glam::Vec4;

#[derive(Component, Clone, Debug, PartialEq)]
pub struct Material {
    pub base_color: Vec4,
    pub albedo_path: Option<String>,
}

impl Material {
    /// Creates a material with a solid base color and an optional texture reference.
    pub fn new(base_color: Vec4, albedo_path: Option<String>) -> Self {
        Self {
            base_color,
            albedo_path,
        }
    }
}

impl Default for Material {
    fn default() -> Self {
        Self::new(Vec4::new(0.8, 0.85, 0.92, 1.0), None)
    }
}