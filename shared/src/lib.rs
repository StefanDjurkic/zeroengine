pub mod components;
pub mod constants;
pub mod messages;
pub mod types;

pub use components::*;
pub use constants::*;
pub use messages::*;
pub use types::*;

use serde::{Serialize, de::DeserializeOwned};

/// Serializes a client message into the engine's shared binary protocol.
pub fn encode_client_message(message: &ClientMessage) -> EngineResult<Vec<u8>> {
    encode(message)
}

/// Deserializes a client message from the engine's shared binary protocol.
pub fn decode_client_message(bytes: &[u8]) -> EngineResult<ClientMessage> {
    decode(bytes)
}

/// Serializes a server message into the engine's shared binary protocol.
pub fn encode_server_message(message: &ServerMessage) -> EngineResult<Vec<u8>> {
    encode(message)
}

/// Deserializes a server message from the engine's shared binary protocol.
pub fn decode_server_message(bytes: &[u8]) -> EngineResult<ServerMessage> {
    decode(bytes)
}

fn encode<T>(value: &T) -> EngineResult<Vec<u8>>
where
    T: Serialize,
{
    Ok(bincode::serialize(value)?)
}

fn decode<T>(bytes: &[u8]) -> EngineResult<T>
where
    T: DeserializeOwned,
{
    Ok(bincode::deserialize(bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_message_round_trip() {
        let message = ClientMessage::PlayerInput {
            tick: 7,
            input: InputSnapshot {
                movement: [1.0, 0.0],
                look: [0.25, -0.5],
                actions: vec![Action::Jump, Action::UseAbility { ability_id: 42 }],
            },
        };

        let encoded = encode_client_message(&message).expect("client message should serialize");
        let decoded = decode_client_message(&encoded).expect("client message should deserialize");

        assert_eq!(decoded, message);
    }

    #[test]
    fn server_message_round_trip() {
        let message = ServerMessage::WorldSnapshot {
            tick: 9,
            entities: vec![EntitySnapshot {
                entity_id: 1,
                transform: Transform::default(),
                velocity: Some(Velocity::default()),
                health: Some(Health {
                    current: 100.0,
                    max: 100.0,
                }),
                player_info: Some(PlayerInfo {
                    entity_id: 1,
                    display_name: "Pilot".to_string(),
                }),
            }],
        };

        let encoded = encode_server_message(&message).expect("server message should serialize");
        let decoded = decode_server_message(&encoded).expect("server message should deserialize");

        assert_eq!(decoded, message);
    }
}