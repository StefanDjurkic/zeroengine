pub const TICK_RATE: u32 = 20;
pub const TICK_DURATION_SECS: f32 = 1.0 / TICK_RATE as f32;
pub const MAX_PLAYER_SPEED: f32 = 10.0;
pub const MAX_ENTITIES_PER_ZONE: usize = 5_000;
pub const CLIENT_PREDICTION_BUFFER: usize = 64;
pub const INTERPOLATION_DELAY_TICKS: u32 = 3;