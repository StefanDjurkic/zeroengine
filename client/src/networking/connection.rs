#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionPhase {
    Disconnected,
    Connecting,
    Connected,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetworkConnection {
    pub endpoint: String,
    pub phase: ConnectionPhase,
}

impl NetworkConnection {
    /// Creates a disconnected connection descriptor for the given endpoint.
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            phase: ConnectionPhase::Disconnected,
        }
    }
}

impl Default for NetworkConnection {
    fn default() -> Self {
        Self::new("ws://127.0.0.1:9001")
    }
}
