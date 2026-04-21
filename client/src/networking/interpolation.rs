use std::collections::VecDeque;

use zero_engine_shared::{EntitySnapshot, Tick};

#[derive(Clone, Debug, Default)]
pub struct InterpolationBuffer {
    snapshots: VecDeque<(Tick, EntitySnapshot)>,
}

impl InterpolationBuffer {
    /// Adds a remote entity snapshot for later interpolation.
    pub fn push(&mut self, tick: Tick, snapshot: EntitySnapshot) {
        self.snapshots.push_back((tick, snapshot));

        while self.snapshots.len() > 32 {
            self.snapshots.pop_front();
        }
    }

    /// Returns the newest server tick stored in the interpolation buffer.
    pub fn latest_tick(&self) -> Option<Tick> {
        self.snapshots.back().map(|(tick, _)| *tick)
    }
}
