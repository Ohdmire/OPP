use std::{
    path::Path,
    sync::{Arc, Mutex, atomic::AtomicBool},
};

use tokio::sync::{Mutex as AsyncMutex, oneshot};

use crate::{
    avatar_cache::AvatarCache, credentials::CredentialStore, error::CommandResult,
    game_session::GameSessionRuntime,
    local_analysis::LocalAnalysisService, osu_api::OsuApi, providers::ProviderRegistry,
    storage::StateStore,
};

#[derive(Default)]
pub struct OAuthRuntime {
    pub cancel: Option<oneshot::Sender<()>>,
    pub state: Option<String>,
}

pub struct AppState {
    pub api: OsuApi,
    pub providers: ProviderRegistry,
    pub avatar_cache: AvatarCache,
    pub credentials: CredentialStore,
    pub local_analysis: Arc<LocalAnalysisService>,
    pub store: StateStore,
    pub oauth: Mutex<OAuthRuntime>,
    pub beatmap_download: Mutex<Option<Arc<AtomicBool>>>,
    pub token_refresh: AsyncMutex<()>,
    pub game_session: GameSessionRuntime,
}

impl AppState {
    pub fn new(app_data_dir: &Path) -> CommandResult<Self> {
        Ok(Self {
            api: OsuApi::new()?,
            providers: ProviderRegistry::new()?,
            avatar_cache: AvatarCache::new(app_data_dir)?,
            credentials: CredentialStore,
            local_analysis: Arc::new(LocalAnalysisService::new(app_data_dir)?),
            store: StateStore::load(app_data_dir)?,
            oauth: Mutex::new(OAuthRuntime::default()),
            beatmap_download: Mutex::new(None),
            token_refresh: AsyncMutex::new(()),
            game_session: GameSessionRuntime::default(),
        })
    }
}
