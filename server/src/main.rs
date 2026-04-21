mod networking;
mod systems;
mod world;

use world::ServerApp;
use zero_engine_shared::{EngineResult, TICK_DURATION_SECS};

#[tokio::main]
async fn main() -> EngineResult<()> {
    let mut app = ServerApp::new();
    println!(
        "ZeroEngine server ready on {} at {} ticks per second",
        app.listen_addr(),
        zero_engine_shared::TICK_RATE
    );
    app.run_until_shutdown(std::time::Duration::from_secs_f32(TICK_DURATION_SECS))
        .await
}
