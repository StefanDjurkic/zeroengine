use glam::Vec2;
use zero_engine_shared::{EngineError, EngineResult, InputSnapshot};

/// Validates a client input snapshot before authoritative simulation.
pub fn validate_input(snapshot: &InputSnapshot) -> EngineResult<()> {
    let movement = Vec2::from_array(snapshot.movement);

    if movement.length() > 1.0 + f32::EPSILON {
        return Err(EngineError::server(
            "input movement exceeded the normalized range",
        ));
    }

    if snapshot.actions.len() > 16 {
        return Err(EngineError::server(
            "input snapshot contained too many actions for a single tick",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use zero_engine_shared::{Action, InputSnapshot};

    use super::validate_input;

    #[test]
    fn oversized_input_is_rejected() {
        let snapshot = InputSnapshot {
            movement: [2.0, 0.0],
            look: [0.0, 0.0],
            actions: vec![Action::Jump],
        };

        assert!(validate_input(&snapshot).is_err());
    }
}