// 2D overlay shader — renders flat colored quads in screen-space.
// Used by the script bridge to draw shapes from JS++ code on top of the 3D scene.

struct Overlay2DUniform {
    viewport_size: vec2<f32>,
    _pad: vec2<f32>,
}

@group(0) @binding(0)
var<uniform> overlay: Overlay2DUniform;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) color: vec4<f32>,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    // Convert pixel coordinates to NDC: x: [0, width] → [-1, 1], y: [0, height] → [1, -1]
    let ndc_x = (input.position.x / overlay.viewport_size.x) * 2.0 - 1.0;
    let ndc_y = 1.0 - (input.position.y / overlay.viewport_size.y) * 2.0;
    output.clip_position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
    output.color = input.color;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
