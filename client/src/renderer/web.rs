use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use wasm_bindgen::JsCast;
use wgpu::util::DeviceExt;
use web_sys::HtmlCanvasElement;
use zero_engine_shared::{EngineError, EngineResult};

use super::{RenderScene, mesh::{self, MeshTextureData, MeshVertex}, overlay::OverlayRenderer};
use crate::scripting;

const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24Plus;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct FrameUniform {
    view_projection: [[f32; 4]; 4],
    camera_position: [f32; 4],
    light_direction: [f32; 4],
    light_color: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ObjectUniform {
    model_matrix: [[f32; 4]; 4],
    normal_matrix: [[f32; 4]; 4],
    base_color: [f32; 4],
}

struct DepthTarget {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
}

struct CanvasSize {
    width: u32,
    height: u32,
}

pub struct WebRenderer {
    canvas: HtmlCanvasElement,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    render_pipeline: wgpu::RenderPipeline,
    frame_uniform_buffer: wgpu::Buffer,
    frame_bind_group: wgpu::BindGroup,
    object_uniform_buffer: wgpu::Buffer,
    object_bind_group: wgpu::BindGroup,
    material_bind_group: wgpu::BindGroup,
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    index_count: u32,
    depth_target: DepthTarget,
    overlay: OverlayRenderer,
}

impl WebRenderer {
    /// Creates the browser WebGPU renderer for the engine canvas.
    pub async fn initialize(asset_path: &str) -> EngineResult<Self> {
        let canvas = engine_canvas()?;
        let initial_size = resize_canvas_to_window(&canvas)?;

        let instance = wgpu::Instance::default();
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|error| EngineError::browser(error.to_string()))?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .map_err(|error| EngineError::browser(error.to_string()))?;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("ZeroEngine Device"),
                ..Default::default()
            })
            .await
            .map_err(|error| EngineError::browser(error.to_string()))?;

        let capabilities = surface.get_capabilities(&adapter);
        let format = capabilities
            .formats
            .iter()
            .copied()
            .find(wgpu::TextureFormat::is_srgb)
            .or_else(|| capabilities.formats.first().copied())
            .ok_or_else(|| EngineError::browser("surface reported no supported formats"))?;
        let present_mode = capabilities
            .present_modes
            .iter()
            .copied()
            .find(|mode| *mode == wgpu::PresentMode::Fifo)
            .or_else(|| capabilities.present_modes.first().copied())
            .ok_or_else(|| EngineError::browser("surface reported no present modes"))?;
        let alpha_mode = capabilities
            .alpha_modes
            .first()
            .copied()
            .ok_or_else(|| EngineError::browser("surface reported no alpha modes"))?;

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: initial_size.width.max(1),
            height: initial_size.height.max(1),
            present_mode,
            alpha_mode,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        let frame_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("ZeroEngine Frame Bind Group Layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        let material_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("ZeroEngine Material Bind Group Layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                ],
            });
        let object_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("ZeroEngine Object Bind Group Layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });

        let frame_uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ZeroEngine Frame Uniform Buffer"),
            contents: bytemuck::bytes_of(&FrameUniform::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let frame_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ZeroEngine Frame Bind Group"),
            layout: &frame_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: frame_uniform_buffer.as_entire_binding(),
            }],
        });

        let object_uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ZeroEngine Object Uniform Buffer"),
            contents: bytemuck::bytes_of(&ObjectUniform::zeroed()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let object_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ZeroEngine Object Bind Group"),
            layout: &object_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: object_uniform_buffer.as_entire_binding(),
            }],
        });

        let imported_mesh = mesh::load_mesh_asset(asset_path)?;
        let material_bind_group = create_material_bind_group(
            &device,
            &queue,
            &material_bind_group_layout,
            imported_mesh.base_color_texture.as_ref(),
        );

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ZeroEngine Basic Mesh Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/basic_mesh.wgsl").into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ZeroEngine Mesh Pipeline Layout"),
            bind_group_layouts: &[
                &frame_bind_group_layout,
                &material_bind_group_layout,
                &object_bind_group_layout,
            ],
            push_constant_ranges: &[],
        });
        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ZeroEngine Mesh Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[MeshVertex::layout()],
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH_FORMAT,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Less,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview: None,
            cache: None,
        });

        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ZeroEngine Imported Mesh Vertex Buffer"),
            contents: bytemuck::cast_slice(imported_mesh.vertices.as_slice()),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let index_count = imported_mesh.indices.len() as u32;
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ZeroEngine Imported Mesh Index Buffer"),
            contents: bytemuck::cast_slice(imported_mesh.indices.as_slice()),
            usage: wgpu::BufferUsages::INDEX,
        });
        let depth_target = create_depth_target(&device, &config);
        let overlay = OverlayRenderer::new(&device, format);

        Ok(Self {
            canvas,
            surface,
            device,
            queue,
            config,
            render_pipeline,
            frame_uniform_buffer,
            frame_bind_group,
            object_uniform_buffer,
            object_bind_group,
            material_bind_group,
            vertex_buffer,
            index_buffer,
            index_count,
            depth_target,
            overlay,
        })
    }

    /// Renders the active camera, light, and cube object to the engine canvas.
    pub fn render(&mut self, scene: &RenderScene) -> EngineResult<()> {
        self.resize_if_needed()?;
        self.write_scene_uniforms(scene);

        let frame = match self.surface.get_current_texture() {
            Ok(frame) => frame,
            Err(wgpu::SurfaceError::Lost) | Err(wgpu::SurfaceError::Outdated) => {
                self.surface.configure(&self.device, &self.config);
                return Ok(());
            }
            Err(wgpu::SurfaceError::Timeout) => {
                return Ok(());
            }
            Err(wgpu::SurfaceError::OutOfMemory) => {
                return Err(EngineError::browser(
                    "the WebGPU surface ran out of memory while rendering".to_string(),
                ));
            }
            Err(error) => {
                return Err(EngineError::browser(format!(
                    "failed to acquire a surface texture: {error}"
                )));
            }
        };

        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("ZeroEngine Mesh Encoder"),
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ZeroEngine Mesh Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.05,
                            g: 0.08,
                            b: 0.13,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth_target.view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_bind_group(0, &self.frame_bind_group, &[]);
            render_pass.set_bind_group(1, &self.material_bind_group, &[]);
            render_pass.set_bind_group(2, &self.object_bind_group, &[]);
            render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
            render_pass.draw_indexed(0..self.index_count, 0, 0..1);
        }

        // Render 2D overlay from JS++ script shapes
        let script_scene = scripting::peek_scene();
        if !script_scene.shapes.is_empty() {
            self.overlay.render(
                &self.device,
                &self.queue,
                &mut encoder,
                &view,
                self.config.width as f32,
                self.config.height as f32,
                &script_scene,
            );
        }

        self.queue.submit([encoder.finish()]);
        frame.present();
        Ok(())
    }

    fn write_scene_uniforms(&self, scene: &RenderScene) {
        let aspect_ratio = (self.config.width.max(1) as f32) / (self.config.height.max(1) as f32);
        let forward = scene.camera.rotation * -Vec3::Z;
        let up = scene.camera.rotation * Vec3::Y;
        let view_matrix = Mat4::look_to_rh(scene.camera.position, forward, up);
        let projection_matrix = Mat4::perspective_rh(
            scene.camera.fov_y_radians,
            aspect_ratio,
            scene.camera.near_plane,
            scene.camera.far_plane,
        );
        let frame_uniform = FrameUniform {
            view_projection: (projection_matrix * view_matrix).to_cols_array_2d(),
            camera_position: scene.camera.position.extend(1.0).to_array(),
            light_direction: scene.light.direction.extend(0.0).to_array(),
            light_color: scene.light.color.extend(1.0).to_array(),
        };
        let object_uniform = ObjectUniform {
            model_matrix: scene.object.model_matrix.to_cols_array_2d(),
            normal_matrix: scene.object.normal_matrix.to_cols_array_2d(),
            base_color: scene.object.base_color.to_array(),
        };

        self.queue.write_buffer(
            &self.frame_uniform_buffer,
            0,
            bytemuck::bytes_of(&frame_uniform),
        );
        self.queue.write_buffer(
            &self.object_uniform_buffer,
            0,
            bytemuck::bytes_of(&object_uniform),
        );
    }

    fn resize_if_needed(&mut self) -> EngineResult<()> {
        let latest_size = resize_canvas_to_window(&self.canvas)?;
        if latest_size.width == self.config.width && latest_size.height == self.config.height {
            return Ok(());
        }

        self.config.width = latest_size.width.max(1);
        self.config.height = latest_size.height.max(1);
        self.surface.configure(&self.device, &self.config);
        self.depth_target = create_depth_target(&self.device, &self.config);
        Ok(())
    }
}

fn create_material_bind_group(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
    texture_data: Option<&MeshTextureData>,
) -> wgpu::BindGroup {
    let fallback_texture;
    let texture_data = match texture_data {
        Some(texture_data) => texture_data,
        None => {
            fallback_texture = fallback_checkerboard_texture();
            &fallback_texture
        }
    };
    let texture_size = wgpu::Extent3d {
        width: texture_data.width.max(1),
        height: texture_data.height.max(1),
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("ZeroEngine Material Texture"),
        size: texture_size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &texture_data.rgba_pixels,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(4 * texture_size.width),
            rows_per_image: Some(texture_size.height),
        },
        texture_size,
    );
    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("ZeroEngine Material Sampler"),
        address_mode_u: wgpu::AddressMode::Repeat,
        address_mode_v: wgpu::AddressMode::Repeat,
        address_mode_w: wgpu::AddressMode::Repeat,
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        mipmap_filter: wgpu::FilterMode::Nearest,
        ..Default::default()
    });
    let texture_view = texture.create_view(&wgpu::TextureViewDescriptor::default());

    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ZeroEngine Material Bind Group"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(&texture_view),
            },
        ],
    })
}

fn fallback_checkerboard_texture() -> MeshTextureData {
    MeshTextureData {
        width: 2,
        height: 2,
        rgba_pixels: vec![
            250, 112, 80, 255, 34, 192, 198, 255, 34, 192, 198, 255, 250, 214, 74, 255,
        ],
    }
}

fn create_depth_target(device: &wgpu::Device, config: &wgpu::SurfaceConfiguration) -> DepthTarget {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("ZeroEngine Depth Texture"),
        size: wgpu::Extent3d {
            width: config.width.max(1),
            height: config.height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: DEPTH_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

    DepthTarget {
        _texture: texture,
        view,
    }
}

fn engine_canvas() -> EngineResult<HtmlCanvasElement> {
    let window = web_sys::window().ok_or_else(|| EngineError::browser("browser window was not available"))?;
    let document = window
        .document()
        .ok_or_else(|| EngineError::browser("browser document was not available"))?;
    let element = document
        .get_element_by_id("engine-canvas")
        .ok_or_else(|| EngineError::browser("engine canvas element was not found"))?;

    element
        .dyn_into::<HtmlCanvasElement>()
        .map_err(|_| EngineError::browser("engine canvas element had the wrong type"))
}

fn resize_canvas_to_window(canvas: &HtmlCanvasElement) -> EngineResult<CanvasSize> {
    let window = web_sys::window().ok_or_else(|| EngineError::browser("browser window was not available"))?;
    let logical_width = window
        .inner_width()
        .map_err(|_| EngineError::browser("failed to read browser width"))?
        .as_f64()
        .ok_or_else(|| EngineError::browser("browser width was not numeric"))?;
    let logical_height = window
        .inner_height()
        .map_err(|_| EngineError::browser("failed to read browser height"))?
        .as_f64()
        .ok_or_else(|| EngineError::browser("browser height was not numeric"))?;
    let device_pixel_ratio = window.device_pixel_ratio();

    let width = (logical_width * device_pixel_ratio).round().max(1.0) as u32;
    let height = (logical_height * device_pixel_ratio).round().max(1.0) as u32;

    if canvas.width() != width {
        canvas.set_width(width);
    }
    if canvas.height() != height {
        canvas.set_height(height);
    }

    Ok(CanvasSize { width, height })
}