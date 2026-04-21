#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PipelineConfig {
    pub label: &'static str,
    pub shader_path: &'static str,
}

impl PipelineConfig {
    /// Returns the default mesh pipeline configuration planned for phase one.
    pub fn basic_mesh() -> Self {
        Self {
            label: "basic_mesh",
            shader_path: "src/renderer/shaders/basic_mesh.wgsl",
        }
    }
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self::basic_mesh()
    }
}
