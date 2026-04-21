use bevy_ecs::world::World;
use zero_engine_shared::{
    EngineError, EngineResult, Health, InputSnapshot, PlayerInfo, TICK_RATE, Tick, Transform,
    Velocity,
};

use crate::{
    networking::{NetworkingState, session::SessionRegistry},
    systems,
};

pub struct ServerApp {
    world: World,
    networking: NetworkingState,
    sessions: SessionRegistry,
    pending_inputs: Vec<InputSnapshot>,
    current_tick: Tick,
}

impl ServerApp {
    /// Creates a server application with a seeded world and local networking configuration.
    pub fn new() -> Self {
        let mut world = World::new();
        seed_world(&mut world);
        let mut sessions = SessionRegistry::default();
        sessions.upsert(crate::networking::session::Session {
            session_id: 1,
            entity_id: 1,
            display_name: "Bootstrap Player".to_string(),
        });

        Self {
            world,
            networking: NetworkingState::default(),
            sessions,
            pending_inputs: Vec::new(),
            current_tick: 0,
        }
    }

    /// Returns the configured listen address for the server's networking layer.
    pub fn listen_addr(&self) -> &str {
        &self.networking.listen_addr
    }

    /// Runs the authoritative server tick loop until the process receives Ctrl+C.
    pub async fn run_until_shutdown(
        &mut self,
        tick_interval: std::time::Duration,
    ) -> EngineResult<()> {
        let mut interval = tokio::time::interval(tick_interval);

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    self.tick()?;
                }
                signal = tokio::signal::ctrl_c() => {
                    signal.map_err(|error| EngineError::server(error.to_string()))?;
                    self.sessions.remove(1);
                    println!("Shutdown signal received. Stopping ZeroEngine server.");
                    break;
                }
            }
        }

        Ok(())
    }

    /// Advances the authoritative world by one fixed server tick.
    pub fn tick(&mut self) -> EngineResult<()> {
        for snapshot in self.pending_inputs.drain(..) {
            systems::validate_snapshot(&snapshot)?;
        }

        let persisted_entities = systems::run_server_systems(&mut self.world)?;
        self.current_tick += 1;

        if self.current_tick % TICK_RATE as u64 == 0 {
            println!(
                "Tick {} complete. Active sessions: {}. Persistable entities: {}.",
                self.current_tick,
                self.sessions.len(),
                persisted_entities
            );
        }

        Ok(())
    }
}

fn seed_world(world: &mut World) {
    world.spawn((
        Transform::default(),
        Velocity::default(),
        Health {
            current: 100.0,
            max: 100.0,
        },
        PlayerInfo {
            entity_id: 1,
            display_name: "Bootstrap Player".to_string(),
        },
    ));
}