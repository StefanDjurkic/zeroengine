pub mod session;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetworkingState {
    pub listen_addr: String,
}

impl NetworkingState {
    /// Returns the default local-development networking configuration.
    pub fn local_default() -> Self {
        Self {
            listen_addr: "127.0.0.1:9001".to_string(),
        }
    }
}

impl Default for NetworkingState {
    fn default() -> Self {
        Self::local_default()
    }
}