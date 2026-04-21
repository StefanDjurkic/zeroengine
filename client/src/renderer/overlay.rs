/// 2D overlay renderer — draws script-generated shapes on top of the 3D scene.
/// Uses a simple vertex-colored triangle pipeline with no depth testing.
use bytemuck::{Pod, Zeroable};
use std::f32::consts::PI;
use wgpu::util::DeviceExt;

use crate::scripting::{ScriptScene, ShapeCommand};

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct OverlayVertex {
    position: [f32; 2],
    color: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct OverlayUniform {
    viewport_size: [f32; 2],
    _pad: [f32; 2],
}

pub struct OverlayRenderer {
    pipeline: wgpu::RenderPipeline,
    uniform_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
}

impl OverlayRenderer {
    pub fn new(device: &wgpu::Device, surface_format: wgpu::TextureFormat) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ZeroEngine Overlay 2D Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/overlay_2d.wgsl").into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ZeroEngine Overlay Bind Group Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ZeroEngine Overlay Uniform Buffer"),
            contents: bytemuck::bytes_of(&OverlayUniform {
                viewport_size: [800.0, 600.0],
                _pad: [0.0; 2],
            }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ZeroEngine Overlay Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ZeroEngine Overlay Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ZeroEngine Overlay Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<OverlayVertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                        wgpu::VertexAttribute {
                            offset: 8,
                            shader_location: 1,
                            format: wgpu::VertexFormat::Float32x4,
                        },
                    ],
                }],
            },
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None, // No culling for 2D overlay
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: None, // No depth testing for overlay
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: surface_format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview: None,
            cache: None,
        });

        Self {
            pipeline,
            uniform_buffer,
            bind_group,
        }
    }

    /// Renders the 2D shapes from a script scene as an overlay pass.
    /// Should be called after the 3D mesh pass, within the same command encoder.
    pub fn render(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
        viewport_width: f32,
        viewport_height: f32,
        scene: &ScriptScene,
    ) {
        // Update viewport uniform
        queue.write_buffer(
            &self.uniform_buffer,
            0,
            bytemuck::bytes_of(&OverlayUniform {
                viewport_size: [viewport_width, viewport_height],
                _pad: [0.0; 2],
            }),
        );

        // Build vertex data from shape commands
        let mut vertices: Vec<OverlayVertex> = Vec::new();

        for shape in &scene.shapes {
            match shape {
                ShapeCommand::Rect {
                    x,
                    y,
                    width,
                    height,
                    r,
                    g,
                    b,
                } => {
                    push_rect(&mut vertices, *x, *y, *width, *height, *r, *g, *b);
                }
                ShapeCommand::Circle {
                    x,
                    y,
                    radius,
                    r,
                    g,
                    b,
                } => {
                    push_circle(&mut vertices, *x, *y, *radius, *r, *g, *b);
                }
                ShapeCommand::Line {
                    x1,
                    y1,
                    x2,
                    y2,
                    r,
                    g,
                    b,
                } => {
                    push_line(&mut vertices, *x1, *y1, *x2, *y2, *r, *g, *b);
                }
            }
        }

        if vertices.is_empty() {
            return;
        }

        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ZeroEngine Overlay Vertex Buffer"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ZeroEngine Overlay 2D Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load, // Don't clear — draw on top of 3D
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.set_vertex_buffer(0, vertex_buffer.slice(..));
            pass.draw(0..vertices.len() as u32, 0..1);
        }
    }
}

// ============================================================================
// Shape tessellation helpers
// ============================================================================

fn color_f32(c: u8) -> f32 {
    c as f32 / 255.0
}

fn push_rect(verts: &mut Vec<OverlayVertex>, x: f32, y: f32, w: f32, h: f32, r: u8, g: u8, b: u8) {
    let color = [color_f32(r), color_f32(g), color_f32(b), 1.0];
    // Two triangles for a quad
    verts.push(OverlayVertex {
        position: [x, y],
        color,
    });
    verts.push(OverlayVertex {
        position: [x + w, y],
        color,
    });
    verts.push(OverlayVertex {
        position: [x + w, y + h],
        color,
    });

    verts.push(OverlayVertex {
        position: [x, y],
        color,
    });
    verts.push(OverlayVertex {
        position: [x + w, y + h],
        color,
    });
    verts.push(OverlayVertex {
        position: [x, y + h],
        color,
    });
}

fn push_circle(verts: &mut Vec<OverlayVertex>, cx: f32, cy: f32, radius: f32, r: u8, g: u8, b: u8) {
    let color = [color_f32(r), color_f32(g), color_f32(b), 1.0];
    let segments = 32u32;
    for i in 0..segments {
        let angle0 = 2.0 * PI * (i as f32) / (segments as f32);
        let angle1 = 2.0 * PI * ((i + 1) as f32) / (segments as f32);
        verts.push(OverlayVertex {
            position: [cx, cy],
            color,
        });
        verts.push(OverlayVertex {
            position: [cx + radius * angle0.cos(), cy + radius * angle0.sin()],
            color,
        });
        verts.push(OverlayVertex {
            position: [cx + radius * angle1.cos(), cy + radius * angle1.sin()],
            color,
        });
    }
}

fn push_line(
    verts: &mut Vec<OverlayVertex>,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    r: u8,
    g: u8,
    b: u8,
) {
    let color = [color_f32(r), color_f32(g), color_f32(b), 1.0];
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len = (dx * dx + dy * dy).sqrt().max(0.001);
    let half_width = 1.5; // 3px wide lines
    let nx = -dy / len * half_width;
    let ny = dx / len * half_width;

    verts.push(OverlayVertex {
        position: [x1 + nx, y1 + ny],
        color,
    });
    verts.push(OverlayVertex {
        position: [x1 - nx, y1 - ny],
        color,
    });
    verts.push(OverlayVertex {
        position: [x2 + nx, y2 + ny],
        color,
    });

    verts.push(OverlayVertex {
        position: [x1 - nx, y1 - ny],
        color,
    });
    verts.push(OverlayVertex {
        position: [x2 - nx, y2 - ny],
        color,
    });
    verts.push(OverlayVertex {
        position: [x2 + nx, y2 + ny],
        color,
    });
}
