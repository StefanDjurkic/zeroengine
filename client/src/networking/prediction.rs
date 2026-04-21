use std::collections::VecDeque;

use zero_engine_shared::{CLIENT_PREDICTION_BUFFER, InputSnapshot, Tick};

#[derive(Clone, Debug, Default)]
pub struct PredictionBuffer {
    snapshots: VecDeque<(Tick, InputSnapshot)>,
}

impl PredictionBuffer {
    /// Stores an input snapshot for later reconciliation against server state.
    pub fn remember(&mut self, tick: Tick, snapshot: InputSnapshot) {
        self.snapshots.push_back((tick, snapshot));

        while self.snapshots.len() > CLIENT_PREDICTION_BUFFER {
            self.snapshots.pop_front();
        }
    }

    /// Drops predictions that have already been confirmed by the server.
    pub fn discard_up_to(&mut self, confirmed_tick: Tick) {
        while self
            .snapshots
            .front()
            .map(|(tick, _)| *tick <= confirmed_tick)
            .unwrap_or(false)
        {
            self.snapshots.pop_front();
        }
    }

    /// Returns the number of stored predictions.
    pub fn len(&self) -> usize {
        self.snapshots.len()
    }
}
