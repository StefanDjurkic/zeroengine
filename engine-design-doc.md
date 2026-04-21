# Project Codename: [ENGINE NAME TBD]

## Browser-Native MMO Game Engine — AI Builder Design Specification

---

## 1. Vision

A custom game engine for a massively multiplayer online game that runs entirely in the browser. Players click a link and they're in — no download, no install, no launcher. The engine targets modern browsers via WebAssembly and WebGPU, delivering near-native rendering performance with zero distribution friction.

Both the client and server are written in Rust. They share a common library of types, ensuring compile-time guarantees that client and server always agree on data formats, game constants, and network protocol.

This is an always-online game. There is no single-player mode. Every feature assumes a persistent server-authoritative world.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Language | Rust (stable toolchain) | Client, server, and shared crate |
| Graphics API | wgpu | WebGPU abstraction, runs on browser and native |
| WASM Tooling | wasm-pack + wasm-bindgen | Compile client to WebAssembly for browser |
| ECS | bevy_ecs (standalone) | Entity-component-system on both client and server |
| Serialization | serde + bincode | Fast binary serialization for network messages |
| Networking | WebSockets (upgrade to WebTransport later) | Client-server communication |
| Asset Format | glTF / .glb | 3D models, skeletal rigs, animations |
| Audio | WebAudio API via wasm-bindgen | Spatial and ambient sound |
| Math | glam | Vector/matrix math (used by wgpu and bevy_ecs natively) |
| Build System | Cargo workspace | Monorepo with shared, client, and server crates |

---

## 3. Project Structure

```
engine/
├── Cargo.toml              # Workspace root
├── shared/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── components.rs   # All ECS components (used by client AND server)
│       ├── messages.rs     # Network message types
│       ├── constants.rs    # Game constants (tick rate, speeds, limits)
│       └── types.rs        # Common enums, IDs, error types
├── client/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs          # WASM entry point
│       ├── engine.rs       # Core loop, module registry
│       ├── renderer/
│       │   ├── mod.rs
│       │   ├── pipeline.rs
│       │   ├── mesh.rs
│       │   ├── texture.rs
│       │   ├── camera.rs
│       │   ├── lighting.rs
│       │   ├── animation.rs
│       │   └── shaders/    # WGSL shader files
│       ├── input/
│       │   └── mod.rs
│       ├── audio/
│       │   └── mod.rs
│       ├── networking/
│       │   ├── mod.rs
│       │   ├── connection.rs
│       │   ├── prediction.rs   # Client-side prediction
│       │   └── interpolation.rs
│       ├── ui/
│       │   └── mod.rs
│       └── systems/        # Gameplay systems (client-side)
│           ├── mod.rs
│           ├── movement.rs
│           └── combat.rs
├── server/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── world.rs        # Server-authoritative world state
│       ├── networking/
│       │   ├── mod.rs
│       │   └── session.rs
│       └── systems/        # Gameplay systems (server-authoritative)
│           ├── mod.rs
│           ├── movement.rs
│           ├── combat.rs
│           ├── persistence.rs
│           └── validation.rs
└── assets/
    ├── models/             # .glb files
    ├── textures/           # .png / .ktx2
    ├── animations/         # Embedded in .glb or separate
    └── audio/              # .ogg / .mp3
```

---

## 4. Module Architecture

Every engine system is an isolated module. Modules communicate ONLY through ECS components and an event channel. No module may import another module directly.

### Module Contract

Every module implements this pattern:

```rust
pub struct ModuleName;

impl Module for ModuleName {
    fn init(&mut self, world: &mut World, resources: &mut Resources);
    fn update(&mut self, world: &mut World, resources: &Resources, dt: f32);
    fn shutdown(&mut self, world: &mut World);
}
```

### Module Responsibilities

**Renderer**
- Reads: Transform, Mesh, Material, Skeleton, AnimationState, Camera, Light
- Writes: Nothing in ECS (writes to GPU only)
- Owns: wgpu device, queue, pipelines, bind groups, render passes
- Notes: The only module that touches wgpu. No other module imports wgpu.

**Animation**
- Reads: Skeleton, AnimationClip, AnimationState
- Writes: Transform (computed bone transforms), AnimationState (playback progress)
- Owns: Animation blending logic, bone palette computation
- Notes: Outputs bone matrices. Renderer consumes them. They never talk directly.

**Input**
- Reads: Nothing
- Writes: InputState resource (keyboard, mouse, gamepad state)
- Owns: Browser event listeners via wasm-bindgen
- Notes: Other systems read InputState. Input never reads game state.

**Networking**
- Reads: Components flagged for sync (Transform, Health, etc. on local player)
- Writes: Components on remote entities, ServerMessage event channel
- Owns: WebSocket connection, send/receive queues, message serialization
- Notes: All messages use types from the shared crate. Serialized with bincode.

**Physics / Movement**
- Reads: InputState, Transform, Collider, Velocity
- Writes: Transform, Velocity
- Owns: Collision detection, movement validation
- Notes: Client runs prediction. Server runs authoritative. Same system code via shared crate.

**Audio**
- Reads: Transform (for spatial audio), AudioSource, AudioEvent channel
- Writes: Nothing
- Owns: WebAudio context and nodes
- Notes: Positional audio relative to camera/listener.

**UI**
- Reads: Player state components (Health, Inventory, ChatMessage, etc.)
- Writes: UIEvent channel (button clicks, text input, etc.)
- Owns: HTML/CSS overlay or canvas-based UI
- Notes: UI is an overlay on top of the WebGPU canvas.

**Scene**
- Reads: SceneDescription asset
- Writes: Spawns/despawns entities with full component sets
- Owns: Entity templates, prefab definitions, level loading
- Notes: The only system that spawns gameplay entities.

---

## 5. Shared Crate — The Contract Between Client and Server

The shared crate is the single source of truth. If it's not defined here, client and server cannot exchange it.

### Components (shared/src/components.rs)

```rust
// Every component used by both client and server lives here.
// Components that are client-only (like Mesh, Material) live in the client crate.
// Components that are server-only (like SessionId) live in the server crate.

use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transform {
    pub position: [f32; 3],
    pub rotation: [f32; 4],  // quaternion
    pub scale: [f32; 3],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Velocity {
    pub linear: [f32; 3],
    pub angular: [f32; 3],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Health {
    pub current: f32,
    pub max: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub entity_id: u64,
    pub display_name: String,
}

// ... more shared components as needed
```

### Network Messages (shared/src/messages.rs)

```rust
use serde::{Serialize, Deserialize};
use crate::components::*;

// Client sends these to the server
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ClientMessage {
    Connect { token: String },
    Disconnect,
    PlayerInput { tick: u64, input: InputSnapshot },
    ChatSend { channel: String, text: String },
}

// Server sends these to the client
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ServerMessage {
    Welcome { your_entity_id: u64, tick: u64 },
    WorldSnapshot { tick: u64, entities: Vec<EntitySnapshot> },
    EntitySpawn { entity_id: u64, components: EntitySnapshot },
    EntityDespawn { entity_id: u64 },
    EntityUpdate { entity_id: u64, components: ComponentDelta },
    ChatReceive { sender: String, channel: String, text: String },
    Rejected { reason: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InputSnapshot {
    pub movement: [f32; 2],   // WASD normalized
    pub look: [f32; 2],       // mouse delta
    pub actions: Vec<Action>,  // jump, attack, use, etc.
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntitySnapshot {
    pub entity_id: u64,
    pub transform: Transform,
    pub health: Option<Health>,
    pub player_info: Option<PlayerInfo>,
    // ... optional components
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Action {
    Jump,
    Attack { target: Option<u64> },
    UseAbility { ability_id: u32 },
    Interact { target: u64 },
}
```

### Constants (shared/src/constants.rs)

```rust
// Defined once, used everywhere. Change here, both sides update.
pub const TICK_RATE: u32 = 20;                     // Server ticks per second
pub const TICK_DURATION_SECS: f32 = 1.0 / TICK_RATE as f32;
pub const MAX_PLAYER_SPEED: f32 = 10.0;            // Units per second
pub const MAX_ENTITIES_PER_ZONE: usize = 5000;
pub const CLIENT_PREDICTION_BUFFER: usize = 64;    // Ticks of input history
pub const INTERPOLATION_DELAY_TICKS: u32 = 3;      // Ticks behind for smoothing
```

---

## 6. Build Rules for AI

These rules constrain how the AI writes code for this project. They exist to minimize errors and maintain consistency.

### General

- Use `Result<T, EngineError>` for all fallible operations. Never panic in production code. Never use `.unwrap()` except in tests.
- Define `EngineError` as an enum in the shared crate. Each module adds its own variant.
- All public functions must have a doc comment explaining what they do, what they expect, and what they return.
- No `unsafe` code without a comment explaining exactly why it's necessary and what invariants must hold.
- Prefer `glam` types (Vec3, Quat, Mat4) for all math. Never use raw [f32; 3] arrays internally — those are only for serialization boundaries.
- All serializable types derive `Serialize` and `Deserialize` from serde.
- All components derive `Clone` and `Debug` at minimum.

### Module Rules

- A module may ONLY read/write the components listed in its specification above.
- A module may NEVER import another module. Communication goes through ECS components and event channels only.
- A module may NEVER store references to another module's data.
- If a module needs something from another module, define a component or event for it.

### Naming Conventions

- Types: PascalCase (`RenderPipeline`, `AnimationState`)
- Functions: snake_case (`create_pipeline`, `update_bones`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_PLAYER_SPEED`)
- Module directories: lowercase (`renderer/`, `networking/`)
- Shader files: snake_case.wgsl (`basic_mesh.wgsl`, `skinned_mesh.wgsl`)
- Components: noun describing what it IS (`Health`, `Transform`, `Skeleton`)
- Systems: verb describing what it DOES (`apply_movement`, `interpolate_remote_entities`)

### Shader Rules

- All shaders are written in WGSL (WebGPU Shading Language).
- One shader file per pipeline.
- Bind group 0: per-frame data (camera, time, lighting).
- Bind group 1: per-material data (textures, material properties).
- Bind group 2: per-object data (transform, bone matrices).
- This layout is fixed. All shaders follow it. No exceptions.

### Networking Rules

- The server is ALWAYS authoritative. The client predicts but the server's word is final.
- Client sends inputs, NEVER positions or state. The server simulates and sends results back.
- All messages go through the shared crate message types. No ad-hoc serialization.
- Client implements prediction: simulate inputs locally, store in buffer, reconcile when server confirms.
- Client implements interpolation: remote entities render slightly in the past for smooth movement.

---

## 7. Build Phases

Each phase has a clear deliverable. Do not begin the next phase until the current phase compiles, runs, and meets its "done" criteria.

### Phase 0 — Toolchain Verification
- **Task:** Create the Cargo workspace with all three crates. Client compiles to WASM via wasm-pack. A blank HTML page loads the WASM module and logs "Engine started" to the browser console.
- **Done when:** `wasm-pack build --target web` succeeds. Browser console shows the log message.
- **Server needed:** No.

### Phase 1 — Triangle
- **Task:** Initialize wgpu in the client. Create a render pipeline. Render a single colored triangle on a canvas element that fills the browser window.
- **Done when:** A colored triangle appears in the browser. Window resize is handled.
- **Server needed:** No.

### Phase 2 — Camera and 3D
- **Task:** Implement a perspective camera with keyboard/mouse controls. Render a textured cube. Add basic directional lighting in the shader.
- **Done when:** You can fly around a lit, textured cube with WASD + mouse.
- **Server needed:** No.

### Phase 3 — Mesh Loading
- **Task:** Load a .glb (glTF binary) model. Parse vertex data, index data, and textures. Render the model with lighting.
- **Done when:** A loaded .glb model renders correctly with textures and lighting.
- **Dependencies:** A test .glb file (any free model from the web).
- **Server needed:** No.

### Phase 4 — Skeletal Animation
- **Task:** Parse skeleton and animation data from glTF. Implement bone transform computation. Write a skinned mesh shader that applies bone matrices. Play an animation loop.
- **Done when:** A rigged character plays a walk or idle animation in the browser.
- **Dependencies:** A rigged .glb model with at least one animation.
- **Server needed:** No.

### Phase 5 — ECS Integration
- **Task:** Refactor all existing code into the module architecture. Entities have Transform, Mesh, Material, Skeleton, AnimationState components. A scene system spawns entities. The renderer queries the ECS for what to draw.
- **Done when:** The animated character from Phase 4 is now an ECS entity, spawned by the scene system, drawn by the renderer module, animated by the animation module.
- **Server needed:** No.

### Phase 6 — Networking Foundation
- **Task:** Implement WebSocket connection in the client. Implement WebSocket listener in the server. Client sends a Connect message, server responds with Welcome. Use shared crate message types with bincode serialization.
- **Done when:** Client connects, server logs the connection, client displays "Connected" in browser console with its assigned entity ID.
- **Server needed:** Yes, locally (cargo run the server crate).

### Phase 7 — Multiplayer Movement
- **Task:** Client sends InputSnapshot each tick. Server simulates movement authoritatively. Server broadcasts EntityUpdate to all clients. Client implements interpolation for remote players. Client implements prediction + reconciliation for local player.
- **Done when:** Two browser tabs connect to local server. Each sees the other's character moving smoothly.
- **Server needed:** Yes, locally.

### Phase 8 — World and Persistence
- **Task:** Server maintains persistent world state. Entities persist across player disconnects. Server saves/loads world state (file-based initially, database later).
- **Done when:** Player disconnects and reconnects, finds themselves where they left off.
- **Server needed:** Yes.

### Phase 9 — Gameplay Foundation
- **Task:** Combat system, health, death/respawn, basic AI for NPC entities, chat system.
- **Done when:** Two players can fight an NPC, see health bars, die, respawn, and chat.
- **Server needed:** Yes.

### Phase 10 — Polish and Scale
- **Task:** Asset streaming (load models on demand), level of detail, culling, multiple zones/areas, loading screens, basic UI (health bar, minimap, chat window).
- **Done when:** A playable vertical slice of the MMO.
- **Server needed:** Yes, potentially remote for multi-user testing.

---

## 8. Testing Strategy

- **Unit tests:** Every module has tests in its own crate. Test systems by constructing a World, inserting components, running the system, and asserting component state.
- **Integration tests:** The shared crate has tests that serialize/deserialize every message type to verify client-server compatibility.
- **Visual tests:** Each rendering phase has a "does it look right" check. Screenshot comparison can be added later.
- **Network tests:** Phase 6+ tests should include simulated latency and packet loss to verify prediction/interpolation handles bad conditions.

---

## 9. Performance Targets

- **Frame time:** Under 16ms (60 FPS) on mid-range hardware.
- **WASM size:** Under 10MB initial download (stream assets separately).
- **Network bandwidth:** Under 50KB/s per connected player.
- **Tick rate:** 20 server ticks/second with room for 1000+ connected entities per zone.
- **Startup time:** Under 3 seconds from page load to first rendered frame.

---

## 10. Key Dependencies (Cargo Crates)

**Shared crate:**
- serde (serialization framework)
- bincode (binary format for serde)
- glam (math types)

**Client crate:**
- wgpu (graphics)
- wasm-bindgen (Rust-to-JS bridge)
- web-sys (browser APIs)
- js-sys (JavaScript primitives)
- gltf (glTF model parsing)
- glam (math)

**Server crate:**
- tokio (async runtime)
- tokio-tungstenite (WebSocket server)
- glam (math)

**Both client and server:**
- bevy_ecs (standalone ECS, no full Bevy engine)
- shared crate (workspace dependency)

---

## 11. What This Document Does NOT Cover (Future Decisions)

- Database choice for persistence (Postgres, SQLite, Redis, etc.)
- Authentication and account system
- Anti-cheat beyond server authority
- Content creation pipeline (model authoring, level editor)
- Deployment infrastructure (CDN for assets, game server hosting)
- Payment and monetization systems
- Voice chat
- Sharding / multi-server architecture for large player counts

These are all important but should be decided when the relevant phase is reached, not upfront.

---

## AI Builder Instructions

When working on this project, follow these rules:

1. **Read this document before starting any task.** Understand which phase you're in and which module you're touching.
2. **Only modify files within the module you've been asked to work on.** If the task is "implement skeletal animation," you work in `client/src/renderer/animation.rs` and possibly `shared/src/components.rs`. You do not touch networking, input, or audio.
3. **Run `cargo check` after every change.** If it doesn't compile, fix it before moving on.
4. **Run `wasm-pack build --target web` for client changes.** Verify the WASM builds.
5. **Never use `.unwrap()` in non-test code.** Use `?` with proper error types.
6. **Follow the shader bind group layout exactly.** Group 0 = frame, Group 1 = material, Group 2 = object.
7. **All network messages go through shared crate types.** No ad-hoc serialization.
8. **When in doubt, keep it simple.** A working simple solution beats a broken complex one. We iterate.
