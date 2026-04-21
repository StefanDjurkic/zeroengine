use bevy_ecs::component::Component;

#[derive(Component, Clone, Debug, Default, PartialEq, Eq)]
pub struct Skeleton {
    pub joint_count: usize,
}

#[derive(Component, Clone, Debug, PartialEq, Eq)]
pub struct AnimationClip {
    pub name: String,
    pub joint_count: usize,
}

impl Default for AnimationClip {
    fn default() -> Self {
        Self {
            name: "idle".to_string(),
            joint_count: 0,
        }
    }
}

#[derive(Component, Clone, Debug, PartialEq)]
pub struct AnimationState {
    pub clip_name: String,
    pub elapsed_seconds: f32,
    pub looping: bool,
}

impl AnimationState {
    /// Advances the animation clock by a non-negative delta.
    pub fn advance(&mut self, delta_seconds: f32) {
        self.elapsed_seconds = (self.elapsed_seconds + delta_seconds.max(0.0)).max(0.0);
    }
}

impl Default for AnimationState {
    fn default() -> Self {
        Self {
            clip_name: "idle".to_string(),
            elapsed_seconds: 0.0,
            looping: true,
        }
    }
}