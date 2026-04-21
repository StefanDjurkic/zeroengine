use std::mem;

use bevy_ecs::component::Component;
use bytemuck::{Pod, Zeroable};
use gltf::image::Format as ImageFormat;
use zero_engine_shared::{EngineError, EngineResult};

pub const BOOTSTRAP_MODEL_PATH: &str = "assets/models/bootstrap_cube.glb";
pub const BUILTIN_CUBE_ALIAS: &str = "builtin:cube";

const BOOTSTRAP_MODEL_BYTES: &[u8] = include_bytes!("../../../assets/models/bootstrap_cube.glb");

#[derive(Component, Clone, Debug, PartialEq, Eq)]
pub struct Mesh {
    pub asset_path: String,
}

impl Mesh {
    /// Creates a mesh component that references an asset path.
    pub fn new(asset_path: impl Into<String>) -> Self {
        Self {
            asset_path: asset_path.into(),
        }
    }

    /// Creates the default imported bootstrap mesh used by the browser prototype.
    pub fn bootstrap_cube() -> Self {
        Self::new(BOOTSTRAP_MODEL_PATH)
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct MeshVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
}

impl MeshVertex {
    pub const ATTRIBUTES: [wgpu::VertexAttribute; 3] =
        wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x2];

    pub fn layout() -> wgpu::VertexBufferLayout<'static> {
        wgpu::VertexBufferLayout {
            array_stride: mem::size_of::<Self>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &Self::ATTRIBUTES,
        }
    }
}

#[derive(Clone, Debug)]
pub struct MeshTextureData {
    pub width: u32,
    pub height: u32,
    pub rgba_pixels: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct MeshAssetData {
    pub vertices: Vec<MeshVertex>,
    pub indices: Vec<u32>,
    pub base_color_texture: Option<MeshTextureData>,
}

/// Loads a mesh asset from the engine's embedded bootstrap asset set.
pub fn load_mesh_asset(asset_path: &str) -> EngineResult<MeshAssetData> {
    let bytes = match asset_path {
        BOOTSTRAP_MODEL_PATH | BUILTIN_CUBE_ALIAS => BOOTSTRAP_MODEL_BYTES,
        _ => {
            return Err(EngineError::asset(format!(
                "unsupported mesh asset path: {asset_path}"
            )));
        }
    };

    load_glb_asset(bytes)
}

fn load_glb_asset(bytes: &[u8]) -> EngineResult<MeshAssetData> {
    let (document, buffers, images) =
        gltf::import_slice(bytes).map_err(|error| EngineError::asset(error.to_string()))?;
    let mesh = document
        .meshes()
        .next()
        .ok_or_else(|| EngineError::asset("glb asset did not contain a mesh"))?;
    let primitive = mesh
        .primitives()
        .next()
        .ok_or_else(|| EngineError::asset("glb mesh did not contain a primitive"))?;

    if primitive.mode() != gltf::mesh::Mode::Triangles {
        return Err(EngineError::asset(format!(
            "unsupported primitive mode {:?}; only triangle lists are supported",
            primitive.mode()
        )));
    }

    let reader = primitive.reader(|buffer| Some(buffers[buffer.index()].0.as_slice()));
    let positions: Vec<[f32; 3]> = reader
        .read_positions()
        .ok_or_else(|| EngineError::asset("glb primitive did not contain vertex positions"))?
        .collect();
    let vertex_count = positions.len();

    let normals: Vec<[f32; 3]> = reader
        .read_normals()
        .map(|iter| iter.collect())
        .unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; vertex_count]);
    if normals.len() != vertex_count {
        return Err(EngineError::asset(
            "glb primitive normals did not match the position count",
        ));
    }

    let tex_coords: Vec<[f32; 2]> = reader
        .read_tex_coords(0)
        .map(|iter| iter.into_f32().collect())
        .unwrap_or_else(|| vec![[0.0, 0.0]; vertex_count]);
    if tex_coords.len() != vertex_count {
        return Err(EngineError::asset(
            "glb primitive texture coordinates did not match the position count",
        ));
    }

    let vertices = positions
        .into_iter()
        .zip(normals)
        .zip(tex_coords)
        .map(|((position, normal), uv)| MeshVertex {
            position,
            normal,
            uv,
        })
        .collect();

    let indices = match reader.read_indices() {
        Some(indices) => indices.into_u32().collect(),
        None => (0..vertex_count as u32).collect(),
    };

    let base_color_texture = primitive
        .material()
        .pbr_metallic_roughness()
        .base_color_texture()
        .and_then(|info| images.get(info.texture().source().index()))
        .or_else(|| images.first())
        .map(normalize_texture)
        .transpose()?;

    Ok(MeshAssetData {
        vertices,
        indices,
        base_color_texture,
    })
}

fn normalize_texture(image: &gltf::image::Data) -> EngineResult<MeshTextureData> {
    let rgba_pixels = match image.format {
        ImageFormat::R8 => {
            let mut rgba_pixels = Vec::with_capacity(image.pixels.len() * 4);
            for red in &image.pixels {
                rgba_pixels.extend_from_slice(&[*red, *red, *red, 255]);
            }
            rgba_pixels
        }
        ImageFormat::R8G8 => {
            let mut rgba_pixels = Vec::with_capacity((image.pixels.len() / 2) * 4);
            for channels in image.pixels.chunks_exact(2) {
                rgba_pixels.extend_from_slice(&[channels[0], channels[1], 0, 255]);
            }
            rgba_pixels
        }
        ImageFormat::R8G8B8 => {
            let mut rgba_pixels = Vec::with_capacity((image.pixels.len() / 3) * 4);
            for channels in image.pixels.chunks_exact(3) {
                rgba_pixels.extend_from_slice(&[channels[0], channels[1], channels[2], 255]);
            }
            rgba_pixels
        }
        ImageFormat::R8G8B8A8 => image.pixels.clone(),
        unsupported => {
            return Err(EngineError::asset(format!(
                "unsupported image format in glb asset: {unsupported:?}"
            )));
        }
    };

    Ok(MeshTextureData {
        width: image.width,
        height: image.height,
        rgba_pixels,
    })
}

#[cfg(test)]
mod tests {
    use super::{BOOTSTRAP_MODEL_PATH, load_mesh_asset};

    #[test]
    fn bootstrap_glb_contains_geometry_and_texture() {
        let asset = load_mesh_asset(BOOTSTRAP_MODEL_PATH)
            .expect("bootstrap glb should parse from the embedded asset bytes");

        assert_eq!(asset.vertices.len(), 24);
        assert_eq!(asset.indices.len(), 36);

        let texture = asset
            .base_color_texture
            .expect("bootstrap glb should provide a base color texture");
        assert_eq!(texture.width, 2);
        assert_eq!(texture.height, 2);
        assert_eq!(texture.rgba_pixels.len(), 16);
    }
}
