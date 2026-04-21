use serde::{Deserialize, Serialize};

use crate::{
    components::{Health, PlayerInfo, Transform, Velocity},
    types::{EntityId, Tick},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ClientMessage {
    Connect { token: String },
    Disconnect,
    PlayerInput { tick: Tick, input: InputSnapshot },
    ChatSend { channel: String, text: String },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ServerMessage {
    Welcome { your_entity_id: EntityId, tick: Tick },
    WorldSnapshot { tick: Tick, entities: Vec<EntitySnapshot> },
    EntitySpawn { entity_id: EntityId, components: EntitySnapshot },
    EntityDespawn { entity_id: EntityId },
    EntityUpdate { entity_id: EntityId, components: ComponentDelta },
    ChatReceive { sender: String, channel: String, text: String },
    Rejected { reason: String },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct InputSnapshot {
    pub movement: [f32; 2],
    pub look: [f32; 2],
    pub actions: Vec<Action>,
}

impl Default for InputSnapshot {
    fn default() -> Self {
        Self {
            movement: [0.0, 0.0],
            look: [0.0, 0.0],
            actions: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EntitySnapshot {
    pub entity_id: EntityId,
    pub transform: Transform,
    pub velocity: Option<Velocity>,
    pub health: Option<Health>,
    pub player_info: Option<PlayerInfo>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct ComponentDelta {
    pub transform: Option<Transform>,
    pub velocity: Option<Velocity>,
    pub health: Option<Health>,
    pub player_info: Option<PlayerInfo>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Action {
    Jump,
    Attack { target: Option<EntityId> },
    UseAbility { ability_id: u32 },
    Interact { target: EntityId },
}