struct FrameUniform {
    view_projection: mat4x4<f32>,
    camera_position: vec4<f32>,
    light_direction: vec4<f32>,
    light_color: vec4<f32>,
}

struct ObjectUniform {
    model_matrix: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    base_color: vec4<f32>,
}

@group(0) @binding(0)
var<uniform> frame: FrameUniform;

@group(1) @binding(0)
var material_sampler: sampler;

@group(1) @binding(1)
var material_texture: texture_2d<f32>;

@group(2) @binding(0)
var<uniform> object: ObjectUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let world_position = object.model_matrix * vec4<f32>(input.position, 1.0);
    let world_normal = normalize((object.normal_matrix * vec4<f32>(input.normal, 0.0)).xyz);

    output.clip_position = frame.view_projection * world_position;
    output.world_position = world_position.xyz;
    output.world_normal = world_normal;
    output.uv = input.uv;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let sampled = textureSample(material_texture, material_sampler, input.uv).rgb;
    let albedo = sampled * object.base_color.rgb;
    let normal = normalize(input.world_normal);
    let light_direction = normalize(-frame.light_direction.xyz);
    let diffuse = max(dot(normal, light_direction), 0.0);
    let ambient = 0.2;
    let lighting = ambient + diffuse * frame.light_color.rgb;
    return vec4<f32>(albedo * lighting, object.base_color.a);
}