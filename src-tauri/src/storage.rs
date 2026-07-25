use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use crate::{
    error::{CommandError, CommandResult},
    models::PersistedState,
};

pub struct StateStore {
    path: PathBuf,
    value: Mutex<PersistedState>,
}

impl StateStore {
    pub fn load(app_data_dir: &Path) -> CommandResult<Self> {
        fs::create_dir_all(app_data_dir)?;
        let path = app_data_dir.join("state.json");
        let value = if path.exists() {
            let source = fs::read_to_string(&path)?;
            serde_json::from_str(&source).unwrap_or_default()
        } else {
            PersistedState::default()
        };

        Ok(Self {
            path,
            value: Mutex::new(value),
        })
    }

    pub fn snapshot(&self) -> CommandResult<PersistedState> {
        self.value
            .lock()
            .map(|state| state.clone())
            .map_err(|_| CommandError::new("STATE_ERROR", "本地状态锁已损坏"))
    }

    pub fn update<R>(&self, operation: impl FnOnce(&mut PersistedState) -> R) -> CommandResult<R> {
        let mut state = self
            .value
            .lock()
            .map_err(|_| CommandError::new("STATE_ERROR", "本地状态锁已损坏"))?;
        let result = operation(&mut state);
        self.persist(&state)?;
        Ok(result)
    }

    fn persist(&self, state: &PersistedState) -> CommandResult<()> {
        let json = serde_json::to_string_pretty(state)?;
        fs::write(&self.path, json)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_round_trips() {
        let directory = tempfile::tempdir().expect("temp directory");
        let store = StateStore::load(directory.path()).expect("create store");
        store
            .update(|state| state.client_id = Some("42".into()))
            .expect("save state");

        let reloaded = StateStore::load(directory.path()).expect("reload store");
        assert_eq!(
            reloaded.snapshot().expect("snapshot").client_id.as_deref(),
            Some("42")
        );
    }
}
