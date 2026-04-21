use std::{error::Error, fmt};

use serde::{Deserialize, Serialize};

pub type EntityId = u64;
pub type Tick = u64;
pub type EngineResult<T> = Result<T, EngineError>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum EngineError {
    Shared(String),
    Client(String),
    Server(String),
    Serialization(String),
    Network(String),
    Browser(String),
    Io(String),
    Asset(String),
}

impl EngineError {
    /// Creates an error originating from client-side code.
    pub fn client(message: impl Into<String>) -> Self {
        Self::Client(message.into())
    }

    /// Creates an error originating from server-side code.
    pub fn server(message: impl Into<String>) -> Self {
        Self::Server(message.into())
    }

    /// Creates an error for browser integration failures.
    pub fn browser(message: impl Into<String>) -> Self {
        Self::Browser(message.into())
    }

    /// Creates an error for asset loading or parsing failures.
    pub fn asset(message: impl Into<String>) -> Self {
        Self::Asset(message.into())
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Shared(message) => write!(formatter, "shared error: {message}"),
            Self::Client(message) => write!(formatter, "client error: {message}"),
            Self::Server(message) => write!(formatter, "server error: {message}"),
            Self::Serialization(message) => write!(formatter, "serialization error: {message}"),
            Self::Network(message) => write!(formatter, "network error: {message}"),
            Self::Browser(message) => write!(formatter, "browser error: {message}"),
            Self::Io(message) => write!(formatter, "io error: {message}"),
            Self::Asset(message) => write!(formatter, "asset error: {message}"),
        }
    }
}

impl Error for EngineError {}

impl From<bincode::Error> for EngineError {
    fn from(error: bincode::Error) -> Self {
        Self::Serialization(error.to_string())
    }
}

impl From<std::io::Error> for EngineError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}
