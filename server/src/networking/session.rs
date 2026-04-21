use std::collections::HashMap;

use zero_engine_shared::EntityId;

pub type SessionId = u64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Session {
    pub session_id: SessionId,
    pub entity_id: EntityId,
    pub display_name: String,
}

#[derive(Clone, Debug, Default)]
pub struct SessionRegistry {
    sessions: HashMap<SessionId, Session>,
}

impl SessionRegistry {
    /// Registers or replaces a session in the active-session registry.
    pub fn upsert(&mut self, session: Session) {
        self.sessions.insert(session.session_id, session);
    }

    /// Removes a session from the registry if it exists.
    pub fn remove(&mut self, session_id: SessionId) {
        self.sessions.remove(&session_id);
    }

    /// Returns the number of active sessions tracked by the server.
    pub fn len(&self) -> usize {
        self.sessions.len()
    }
}
